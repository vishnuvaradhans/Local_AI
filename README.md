# Local_AI

Conversational AI for local use. This project is a simple full-stack ChatGPT-like web app that talks to a local Ollama model through Flask. Chats are temporary and stored only in memory while the page and Flask server are running.

## Project Structure

```text
backend/
  app.py
  requirements.txt
frontend/
  index.html
  style.css
  script.js
```

## Requirements

- Python 3.10 or newer
- Ollama installed locally
- An Ollama model such as `llama3.1:8b`

## Install Backend Dependencies

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

On macOS or Linux, activate the virtual environment with:

```bash
source .venv/bin/activate
```

## Start Ollama

In a separate terminal:

```bash
ollama serve
```

Pull a model if you do not have one yet:

```bash
ollama pull llama3.1:8b
```

## Start Flask

From the `backend` folder:

```bash
python app.py
```

The API will run at:

```text
http://localhost:5000
```

If the UI says `Model missing`, run `ollama pull llama3.1:8b` or change `OLLAMA_MODEL` to one of your installed models.

## Open the Frontend

Open this file in your browser:

```text
frontend/index.html
```

The frontend expects the backend at `http://localhost:5000/api`.

## Change the Ollama Model

The default model is configured in `backend/app.py`:

```python
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
```

You can either edit `"llama3.1:8b"` directly or set an environment variable before starting Flask.

PowerShell:

```powershell
$env:OLLAMA_MODEL="mistral"
python app.py
```

Command Prompt:

```cmd
set OLLAMA_MODEL=mistral
python app.py
```

macOS or Linux:

```bash
OLLAMA_MODEL=mistral python app.py
```

If your model is slow to start responding, increase the Ollama timeout before starting Flask.

PowerShell:

```powershell
$env:OLLAMA_TIMEOUT="180"
python app.py
```

## API Endpoints

- `GET /api/health` checks Flask and Ollama status.
- `POST /api/chat` sends a user message and streams the Ollama response.
- `POST /api/clear` clears the temporary server-side conversation.

## Notes

- No database is used.
- No authentication is included.
- Chat history is temporary and resets when the browser page or Flask process restarts.
- If Ollama is not running, the app shows a friendly offline/error state.
