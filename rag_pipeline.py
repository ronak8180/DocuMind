import os
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader, UnstructuredExcelLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Configure Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Global variables for caching
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

def load_documents(files):
    documents = []
    for file_path in files:
        ext = os.path.splitext(file_path)[1].lower()
        try:
            if ext == '.pdf':
                loader = PyPDFLoader(file_path)
            elif ext == '.docx':
                loader = Docx2txtLoader(file_path)
            elif ext == '.txt':
                loader = TextLoader(file_path, encoding='utf-8')
            elif ext == '.xlsx':
                loader = UnstructuredExcelLoader(file_path)
            else:
                print(f"DEBUG: Skipping unsupported file format: {ext}")
                continue
            
            loaded_docs = loader.load()
            # Filter out empty documents
            valid_docs = [doc for doc in loaded_docs if doc.page_content.strip()]
            if not valid_docs:
                print(f"DEBUG: No text content found in {file_path}")
            documents.extend(valid_docs)
        except Exception as e:
            print(f"Error loading {file_path}: {e}")
    return documents

def get_session_db_path(session_id):
    if not session_id:
        return 'vectorstore/db_faiss'
    return f'vectorstores/{session_id}/db_faiss'

def ingest_documents(files, session_id=None):
    path = get_session_db_path(session_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    print(f"DEBUG: Ingesting {len(files)} files for session {session_id}...")
    docs = load_documents(files)
    if not docs:
        print("DEBUG: No documents with valid text found to load.")
        raise ValueError("No valid text could be extracted from the uploaded documents.")

    print(f"DEBUG: Splitting {len(docs)} documents...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    texts = text_splitter.split_documents(docs)

    if not texts:
        print("DEBUG: No text chunks created after splitting.")
        raise ValueError("Documents were loaded but no text chunks were created.")

    print(f"DEBUG: Creating vector store at {path}...")
    try:
        db = FAISS.from_documents(texts, embeddings)
        db.save_local(path)
        print(f"DEBUG: Vector store saved to {path}")
    except Exception as e:
        print(f"DEBUG: Error creating FAISS index: {e}")
        raise RuntimeError(f"Failed to create search index: {e}")

def get_answer(query, session_id=None):
    """
    Retrieves relevant context and answers the query using Gemini.
    """
    path = get_session_db_path(session_id)
    if not os.path.exists(path):
        return {
            'answer': "No documents uploaded for this chat yet. Please upload files to start chatting.",
            'sources': []
        }

    # Load vector store
    db = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
    
    # Retrieve relevant documents
    retriever = db.as_retriever(search_kwargs={'k': 3})
    relevant_docs = retriever.invoke(query)
    
    if not relevant_docs:
        return {
            'answer': "I'm sorry, but I couldn't find relevant information in the uploaded documents for this chat.",
            'sources': []
        }

    # Prepare context
    context = "\n\n".join([doc.page_content for doc in relevant_docs])
    
    # Generate answer with Gemini
    model = genai.GenerativeModel('gemini-3-flash-preview')
    print(f"DEBUG: Sending query to Gemini for session {session_id}...")
    
    prompt = f"""
    You are a professional Document Assistant. Use the following context to answer the user's question accurately.
    
    CRITICAL INSTRUCTIONS FOR READABILITY:
    1. Use CLEAR MARKDOWN FORMATTING.
    2. Use BULLET POINTS or NUMBERED LISTS for any series of items or steps.
    3. Use **BOLD TEXT** for key terms, names, or important values.
    4. Provide a SHORT summary at the start if the answer is long.
    5. Use PARAGRAPH BREAKS to separate distinct ideas.
    6. If the answer is not in the context, say "I'm sorry, but I couldn't find that information in the uploaded documents."
    
    Context:
    {context}
    
    Question: {query}
    
    Structured Answer:"""

    try:
        response = model.generate_content(prompt)
        print("DEBUG: Gemini response received successfully.")
        # Extract unique sources
        sources = []
        seen_sources = set()
        for doc in relevant_docs:
            source_name = os.path.basename(doc.metadata.get('source', 'Unknown'))
            if source_name not in seen_sources:
                sources.append({
                    'name': source_name,
                    'content': doc.page_content[:200] + "..."
                })
                seen_sources.add(source_name)
        
        return {
            'answer': response.text,
            'sources': sources
        }
    except Exception as e:
        return {
            'answer': f"Error generating answer: {e}",
            'sources': []
        }
