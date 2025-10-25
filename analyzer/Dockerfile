# Use a slim Python base image
FROM python:3.12-slim

# --- START: CRITICAL FIX FOR CV2/MEDIAPIPE DEPENDENCIES ---
# Install system dependencies required for OpenCV/MediaPipe (libGL, etc.)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
# --- END: CRITICAL FIX ---

# Set the working directory inside the container
WORKDIR /app/analyzer

# Copy just the dependency file first to leverage Docker caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install mediapipe

# Copy the rest of the application code
COPY . .

# Expose the port Uvicorn runs on
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]