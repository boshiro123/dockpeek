# Use a lightweight Python base image
FROM python:3.11-slim

# Set environment variable to disable output buffering (improves Flask logging)
ENV PYTHONUNBUFFERED=1

# Create app directory and set it as the working directory
WORKDIR /app

# Copy dependency files
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire application code into the container
COPY . .

# Optional: expose the port Flask runs on (can also be declared in docker-compose)
EXPOSE 8000

# Default command to run the Flask app
CMD ["python", "app.py"]
