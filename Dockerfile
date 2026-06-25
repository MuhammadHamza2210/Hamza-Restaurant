# Docker recipe to run this Express app on Hugging Face Spaces (free, no card).
# Hugging Face serves apps on port 7860, so we run on that port.
FROM node:20-slim

# Run as a non-root user (Hugging Face requirement) with a writable home dir,
# so the SQLite database can be created/written at runtime.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
WORKDIR /home/user/app

# Install dependencies first (better build caching)
COPY --chown=user package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY --chown=user . .

# Hugging Face Spaces expects the app on port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "start"]
