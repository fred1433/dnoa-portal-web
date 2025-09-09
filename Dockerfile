FROM mcr.microsoft.com/playwright:v1.48.0-focal

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy application files
COPY . .

# The browsers are already installed in the Playwright image
# No need to run playwright install

# Use PORT environment variable from Render
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]