const mongoose = require("mongoose");

const TaskSchema = new mongoose.Schema({
  userId: String,
  text: String,
  date: String, // YYYY-MM-DD
  done: { type: Boolean, default: false },
  backlog: { type: Boolean, default: false },
});

module.exports = mongoose.model("Task", TaskSchema);
