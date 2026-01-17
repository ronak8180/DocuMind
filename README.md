# DocuMind AI | SaaS RAG Platform

DocuMind is a modern, professional Retrieval-Augmented Generation (RAG) platform that allows users to upload documents and engage in context-aware conversations with an AI powered by Google Gemini.

## 🚀 Key Features

- **SaaS Interface**: Professional three-column dashboard with a clean landing page.
- **RAG Pipeline**: Advanced document processing using LangChain and FAISS.
- **Multi-Format Support**: Support for PDF, DOCX, TXT, and Excel (XLSX).
- **Interactive Chat**: Streaming word-by-word AI typing animations.
- **File Management**: Drag-and-drop uploads, live document list, and file deletion with automatic index rebuilding.
- **Smart Scrolling**: Floating scroll-to-bottom button for easy chat navigation.
- **Private & Local**: Vector storage is handled locally via FAISS.

## 🛠️ Technology Stack

- **Backend**: Python (Flask)
- **AI Core**: LangChain, HuggingFace (Embeddings), Google Gemini API (`gemini-3-flash-preview`)
- **Vector Store**: FAISS (Meta AI)
- **Frontend**: HTML5, Vanilla CSS3 (Glassmorphism & Matte Slate), JavaScript (ES6+)
- **Icons & Fonts**: FontAwesome 6, Inter Font Family
- **Markdown Rendering**: Marked.js

## 📋 Prerequisites

- Python 3.10+
- Google Gemini API Key

## ⚙️ Installation & Setup

1. **Clone the repository**
   ```powershell
   cd "RAG Project 2"
   ```

2. **Setup Virtual Environment**
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate
   ```

3. **Install Dependencies**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Environment Variables**
   Create a `.env` file in the root directory and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

## 🏃 Running the Application

1. **Start the Flask Server**
   ```powershell
   python app.py
   ```
2. **Access the App**
   Open your browser and navigate to `http://127.0.0.1:5000`.

## 📖 How to Use

1. **Landing Page**: View system information and click **"Start Chatting Now"**.
2. **Upload**: Drag and drop your documents (PDF, DOCX, TXT, XLSX) into the left sidebar.
3. **Index**: Click **"Upload & Index"** to process the files.
4. **Chat**: Ask questions in the central chat area. The AI will respond based on the content of your documents.
5. **Manage**: Use the trash icon next to files in the sidebar to delete them. The AI's index will update automatically.


---
*Built for High-Performance Document Intelligence.*
