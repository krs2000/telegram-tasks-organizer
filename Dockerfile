# Use official Node.js 18 image (or your preferred version)
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the app code
COPY . .

# Expose port (not strictly needed if bot only connects outbound)
EXPOSE 3000

# Start the bot
CMD ["node", "index.js"]