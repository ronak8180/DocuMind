import os
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max limit

# Ensure required directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('history', exist_ok=True)

# Import RAG pipeline integration
from rag_pipeline import ingest_documents, get_answer
import json
import time
import uuid

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/app')
def index():
    return render_template('index.html')

@app.route('/files', methods=['GET'])
def list_files():
    session_id = request.args.get('session_id')
    try:
        if session_id:
            path = os.path.join('history', f"{session_id}.json")
            if os.path.exists(path):
                with open(path, 'r') as f:
                    session_data = json.load(f)
                    return jsonify({'files': session_data.get('files', [])}), 200
        
        # Fallback to all files if no session or file missing
        all_files = os.listdir(app.config['UPLOAD_FOLDER'])
        return jsonify({'files': all_files}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'files' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    session_id = request.form.get('session_id')
    
    files = request.files.getlist('files')
    saved_files = []
    
    for file in files:
        if file.filename == '':
            continue
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        saved_files.append(filepath)
    
    if not saved_files:
         return jsonify({'error': 'No selected file'}), 400

    try:
        # Update session JSON with file names
        if session_id:
            path = os.path.join('history', f"{session_id}.json")
            if os.path.exists(path):
                with open(path, 'r+') as f:
                    session_data = json.load(f)
                    if 'files' not in session_data:
                        session_data['files'] = []
                    
                    for sf in saved_files:
                        fname = os.path.basename(sf)
                        if fname not in session_data['files']:
                            session_data['files'].append(fname)
                    
                    f.seek(0)
                    json.dump(session_data, f)
                    f.truncate()
                
                # Ingest only for THIS session
                session_files = [os.path.join(app.config['UPLOAD_FOLDER'], f) for f in session_data['files']]
                ingest_documents(session_files, session_id=session_id)
        else:
            # Fallback to global ingestion if no session_id (legacy or generic)
            ingest_documents(saved_files)
        
        # Get list of all uploaded files for the UI
        all_files = os.listdir(app.config['UPLOAD_FOLDER'])
        
        return jsonify({
            'message': f'Successfully uploaded and processed {len(saved_files)} files.',
            'files': all_files
        }), 200
    except Exception as e:
        print(f"DEBUG: Upload error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/sessions', methods=['GET'])
def list_sessions():
    try:
        sessions = []
        for f in os.listdir('history'):
            if f.endswith('.json'):
                path = os.path.join('history', f)
                with open(path, 'r') as file:
                    data = json.load(file)
                    sessions.append({
                        'id': data['id'],
                        'title': data.get('title', 'Untitled Chat'),
                        'timestamp': data['timestamp']
                    })
        # Sort by timestamp descending
        sessions.sort(key=lambda x: x['timestamp'], reverse=True)
        return jsonify({'sessions': sessions}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/sessions', methods=['POST'])
def create_session():
    session_id = str(uuid.uuid4())
    session_data = {
        'id': session_id,
        'title': 'New Chat',
        'timestamp': time.time(),
        'messages': []
    }
    path = os.path.join('history', f"{session_id}.json")
    with open(path, 'w') as f:
        json.dump(session_data, f)
    return jsonify(session_data), 201

@app.route('/sessions/<session_id>', methods=['GET'])
def get_session(session_id):
    path = os.path.join('history', f"{session_id}.json")
    if not os.path.exists(path):
        return jsonify({'error': 'Session not found'}), 404
    with open(path, 'r') as f:
        return jsonify(json.load(f)), 200

@app.route('/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    path = os.path.join('history', f"{session_id}.json")
    if os.path.exists(path):
        os.remove(path)
        return jsonify({'message': 'Session deleted'}), 200
    return jsonify({'error': 'Session not found'}), 404

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    query = data.get('query')
    session_id = data.get('session_id')
    
    if not query:
        return jsonify({'error': 'No query provided'}), 400
    
    try:
        # Get result from RAG pipeline with session context
        result = get_answer(query, session_id=session_id)
        
        # Save to history if session_id is provided
        if session_id:
            path = os.path.join('history', f"{session_id}.json")
            if os.path.exists(path):
                with open(path, 'r+') as f:
                    session_data = json.load(f)
                    
                    # Update title if it's the first message
                    if not session_data['messages']:
                        session_data['title'] = query[:30] + ('...' if len(query) > 30 else '')
                    
                    session_data['messages'].append({'role': 'user', 'content': query})
                    session_data['messages'].append({'role': 'ai', 'content': result['answer'], 'sources': result.get('sources', [])})
                    
                    f.seek(0)
                    json.dump(session_data, f)
                    f.truncate()
        
        return jsonify(result), 200
    except Exception as e:
        print(f"DEBUG: Chat error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/delete', methods=['POST'])
def delete_file():
    data = request.json
    filename = data.get('filename')
    session_id = data.get('session_id')
    print(f"DEBUG: Delete request received for: {filename} in session: {session_id}")
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    try:
        if os.path.exists(filepath):
            # If session_id is provided, only remove it from that session's context
            if session_id:
                path = os.path.join('history', f"{session_id}.json")
                if os.path.exists(path):
                    with open(path, 'r+') as f:
                        session_data = json.load(f)
                        if filename in session_data.get('files', []):
                            session_data['files'].remove(filename)
                            
                        f.seek(0)
                        json.dump(session_data, f)
                        f.truncate()
                    
                    # Rebuild session index
                    if session_data.get('files'):
                        full_paths = [os.path.join(app.config['UPLOAD_FOLDER'], f) for f in session_data['files']]
                        ingest_documents(full_paths, session_id=session_id)
                    else:
                        import shutil
                        db_path = f"vectorstores/{session_id}"
                        if os.path.exists(db_path):
                            shutil.rmtree(db_path)
                
                return jsonify({'message': f'Removed {filename} from this chat.'}), 200
            
            # Global delete (legacy behavior or explicitly non-session)
            os.remove(filepath)
            return jsonify({'message': f'Deleted {filename} globally.'}), 200
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
