FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# The browsers are already installed in the Playwright image
# No need to run playwright install

EXPOSE 10000

CMD ["node", "server.js"]