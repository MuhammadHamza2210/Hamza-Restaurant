# Docker recipe to run this Express app on Hugging Face Spaces (free, no card).
# Hugging Face serves apps on port 7860 and requires a non-root user (UID 1000).
# The official node image already ships a "node" user with UID 1000, so we use it.
FROM node:20-slim

# Use the built-in non-root "node" user (UID 1000) with a writable home,
# so the SQLite database can be created/written at runtime.
USER node
ENV HOME=/home/node
WORKDIR /home/node/app

# Install dependencies first (better build caching)
COPY --chown=node:node package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY --chown=node:node . .

# Hugging Face Spaces expects the app on port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "start"]
