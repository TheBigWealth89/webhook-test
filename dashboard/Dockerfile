FROM node:20-alpine

WORKDIR /app

# Copy package.json and package-lock.json from the context root
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Set environment to production
ENV NODE_ENV=production

# Set dashboard port
EXPOSE 7001

# Start the dashboard service
CMD ["npm", "run", "start:dashboard"]
