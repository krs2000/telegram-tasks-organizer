require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Task schema
const taskSchema = new mongoose.Schema({
  userId: Number,
  text: String,
  date: String, // YYYY-MM-DD
  done: { type: Boolean, default: false },
  backlog: { type: Boolean, default: false },
});

const Task = mongoose.model("Task", taskSchema);

// Telegram bot setup
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Escape Markdown special chars
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const welcomeMessage = `
  👋 *Welcome to your Task Organizer Bot!*
  
  Here are the commands you can use:
  
  • /add <task> — Add a new task for today
  • /view — View today's tasks and mark them done
  • /show — Show all tasks (today + backlog)
  • /modify <task_number> <new_text> — Modify a task for today
  • /start — Show this welcome message
  
  Just type a command to get started!
    `;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
});
// /view - show today's tasks with Done buttons
bot.onText(/\/view/, async (msg) => {
  const chatId = msg.chat.id;
  const today = new Date().toISOString().slice(0, 10);

  const tasks = await Task.find({ userId: chatId, date: today });

  if (tasks.length === 0) {
    return bot.sendMessage(chatId, "🎉 No tasks for today.");
  }

  let messageText = "*Today's Tasks:*\n";
  const inlineKeyboard = [];

  tasks.forEach((task, index) => {
    messageText += `${index + 1}. ${escapeMarkdown(task.text)} [${
      task.done ? "✅" : "❌"
    }]\n`;

    if (!task.done) {
      inlineKeyboard.push([
        {
          text: "Done ✅",
          callback_data: `done_${task._id}`,
        },
      ]);
    }
  });

  bot.sendMessage(chatId, messageText, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
});

// /show - show all tasks (today + backlog) with Done buttons
bot.onText(/\/show/, async (msg) => {
  const chatId = msg.chat.id;
  const today = new Date().toISOString().slice(0, 10);

  const todayTasks = await Task.find({ userId: chatId, date: today });
  const backlogTasks = await Task.find({ userId: chatId, backlog: true });

  if (todayTasks.length === 0 && backlogTasks.length === 0) {
    return bot.sendMessage(chatId, "🎉 You have no tasks at all.");
  }

  let messageText = "*Your Tasks:*\n\n";

  // Today's tasks
  messageText += "*Today's Tasks:*\n";
  if (todayTasks.length === 0) {
    messageText += "_No tasks for today_\n\n";
  } else {
    todayTasks.forEach((task, i) => {
      messageText += `${i + 1}. ${escapeMarkdown(task.text)} [${
        task.done ? "✅" : "❌"
      }]\n`;
    });
    messageText += "\n";
  }

  // Backlog tasks
  messageText += "*Backlog Tasks:*\n";
  if (backlogTasks.length === 0) {
    messageText += "_No backlog tasks_\n";
  } else {
    backlogTasks.forEach((task, i) => {
      messageText += `${i + 1}. ${escapeMarkdown(task.text)} [${
        task.done ? "✅" : "❌"
      }]\n`;
    });
  }

  const inlineKeyboard = [];

  [...todayTasks, ...backlogTasks].forEach((task) => {
    if (!task.done) {
      inlineKeyboard.push([
        {
          text: "Done ✅",
          callback_data: `done_${task._id}`,
        },
      ]);
    }
  });

  bot.sendMessage(chatId, messageText, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: inlineKeyboard.length ? inlineKeyboard : undefined,
    },
  });
});

// Handle button presses to mark tasks done
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  if (data.startsWith("done_")) {
    const taskId = data.split("_")[1];

    await Task.findByIdAndUpdate(taskId, { done: true, backlog: false });

    // Refresh the tasks list in the message
    const today = new Date().toISOString().slice(0, 10);
    const tasks = await Task.find({ userId: chatId, date: today });

    let messageText = "*Today's Tasks:*\n";
    const inlineKeyboard = [];

    tasks.forEach((task, index) => {
      messageText += `${index + 1}. ${escapeMarkdown(task.text)} [${
        task.done ? "✅" : "❌"
      }]\n`;
      if (!task.done) {
        inlineKeyboard.push([
          {
            text: "Done ✅",
            callback_data: `done_${task._id}`,
          },
        ]);
      }
    });

    // Edit the original message
    try {
      await bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    } catch (e) {
      // Sometimes editMessageText fails if user pressed button twice quickly, ignore
    }

    bot.answerCallbackQuery(callbackQuery.id, { text: "Task marked as done!" });
  }
});

bot.onText(/\/add (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const taskText = match[1].trim();
  const today = new Date().toISOString().slice(0, 10);

  if (!taskText) {
    return bot.sendMessage(
      chatId,
      "⚠️ Please provide the task text after /add command."
    );
  }

  const newTask = new Task({
    userId: chatId,
    text: taskText,
    date: today,
    done: false,
    backlog: false,
  });

  await newTask.save();
  bot.sendMessage(chatId, `✅ Added task: "${taskText}"`);
});

// Modify task text by number (from today's task list)
bot.onText(/\/modify (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const taskNumber = parseInt(match[1], 10);
  const newText = match[2].trim();
  const today = new Date().toISOString().slice(0, 10);

  if (isNaN(taskNumber) || taskNumber < 1) {
    return bot.sendMessage(chatId, "⚠️ Invalid task number.");
  }
  if (!newText) {
    return bot.sendMessage(
      chatId,
      "⚠️ Please provide the new text for the task."
    );
  }

  // Fetch today's tasks sorted by creation time (to keep order)
  const tasks = await Task.find({ userId: chatId, date: today }).sort({
    _id: 1,
  });

  if (taskNumber > tasks.length) {
    return bot.sendMessage(
      chatId,
      `⚠️ Task number ${taskNumber} does not exist.`
    );
  }

  const taskToModify = tasks[taskNumber - 1];
  taskToModify.text = newText;
  await taskToModify.save();

  bot.sendMessage(chatId, `✏️ Task #${taskNumber} updated to: "${newText}"`);
});
