FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json from the context root
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the API port
EXPOSE 7000

# Set environment to production
ENV NODE_ENV=production

# Start the API service
CMD ["npm", "start"]
