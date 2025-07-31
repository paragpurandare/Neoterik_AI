This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


# Celery and RabbitMQ Setup Guide

This guide walks you through setting up the asynchronous task processing system used in this project. It includes Celery for task management, RabbitMQ as the message broker, and Eventlet for handling I/O-bound operations efficiently.

---

## 🚀 Step 1: Install Dependencies

Activate your Python virtual environment:

```bash
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

Install Celery and Eventlet:

```bash
pip install "celery[rabbitmq,eventlet]"
```

> This installs Celery, RabbitMQ support, and Eventlet. Eventlet is ideal for our I/O-heavy AI and web scraping workloads.

---

## 🐇 Step 2: Set Up RabbitMQ with Docker

### 1. Install Docker

If Docker isn't already installed, download and install it from [Get Docker](https://www.docker.com/get-started/).

### 2. Run RabbitMQ Container

First pull the official rabbitmq image: 

```bash
docker pull rabbitmq:3-management
```

Launch RabbitMQ (with management UI) using Docker:

```bash
docker run -d \
  --hostname my-rabbit \
  --name neoterik-rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

**What this does:**

* `-d`: Runs the container in the background.
* `--name neoterik-rabbitmq`: Gives the container a memorable name.
* `-p 5672:5672`: Exposes RabbitMQ's messaging port.
* `-p 15672:15672`: Exposes the RabbitMQ management dashboard.

📍 Access the RabbitMQ UI at [http://localhost:15672](http://localhost:15672) with login:

* **Username:** `guest`
* **Password:** `guest`

---

## ⚙️ Step 3: Start the Multi-Queue Workers

Use Celery to start workers that listen to both task queues: `default` and `company-research-queue`.

Run this command in a new terminal (after activating your virtual environment):

```bash
celery -A celery_worker.celery_app worker --loglevel=info -Q default,company-research-queue --concurrency=4
```

### Command Breakdown:

* `-A celery_worker.celery_app`: Target the Celery app instance.
* `worker`: Starts the Celery worker process.
* `--loglevel=info`: Enables task logs in the terminal.
* `-Q default,company-research-queue`: Ensures tasks from both queues are consumed.
* `--concurrency=1000`: High concurrency for Eventlet's lightweight threads.
* `-P eventlet`: Uses Eventlet as the concurrency backend.

---

## ✅ System Ready

Your asynchronous task processing system is now fully operational! 🎉

Celery workers will continuously listen for tasks dispatched by the FastAPI backend and execute them efficiently.

---

*If you encounter issues, ensure your virtual environment is activated and Docker is running.*
