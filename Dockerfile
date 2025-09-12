FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

# Install build tools for native dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install Node dependencies WITHOUT running postinstall
RUN npm ci --ignore-scripts

# Copy application files (including TypeScript source)
COPY . .

# Rebuild sqlite3 native bindings for Linux
RUN npm rebuild sqlite3

# Now run the TypeScript build
RUN npm run build

# The browsers are already installed in the Playwright image
# No need to run playwright install

# Use PORT environment variable from Render
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]