import json
import os
from typing import Dict, Generator, List

import requests
from flask import Flask, Response, jsonify, request
from flask_cors import CORS


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
REQUEST_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

app = Flask(__name__)
CORS(app)

# In-memory chat history only. This is reset when the Flask process restarts.
conversation_history: List[Dict[str, str]] = []


def ollama_chat_stream(messages: List[Dict[str, str]]) -> Generator[str, None, None]:
    """Send the current conversation to Ollama and yield text chunks as they arrive."""
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
    }

    try:
        with requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT,
        ) as ollama_response:
            ollama_response.raise_for_status()

            for line in ollama_response.iter_lines():
                if not line:
                    continue

                data = json.loads(line.decode("utf-8"))
                if data.get("message", {}).get("content"):
                    yield data["message"]["content"]

                if data.get("done"):
                    break

    except requests.exceptions.ConnectionError:
        raise RuntimeError("Ollama is not running. Start Ollama and try again.")
    except requests.exceptions.Timeout:
        raise RuntimeError("Ollama took too long to respond. Try again in a moment.")
    except requests.exceptions.HTTPError as exc:
        raise RuntimeError(f"Ollama returned an error: {exc.response.text}")
    except json.JSONDecodeError:
        raise RuntimeError("Ollama returned an unreadable response.")
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"Could not reach Ollama: {exc}")


@app.get("/api/health")
def health():
    """Report whether Flask and the local Ollama service are reachable."""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        response.raise_for_status()
        models = response.json().get("models", [])
        available_model_names = [model.get("name") for model in models]

        return jsonify(
            {
                "flask": "online",
                "ollama": "online",
                "model": OLLAMA_MODEL,
                "model_available": OLLAMA_MODEL in available_model_names,
                "available_models": available_model_names,
            }
        )
    except requests.exceptions.RequestException:
        return (
            jsonify(
                {
                    "flask": "online",
                    "ollama": "offline",
                    "model": OLLAMA_MODEL,
                    "message": "Ollama is not running or is unreachable.",
                }
            ),
            503,
        )


@app.post("/api/chat")
def chat():
    """Accept a user message and stream the assistant response back as plain text."""
    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    client_messages = data.get("messages")

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    if isinstance(client_messages, list):
        messages = [
            {"role": item.get("role"), "content": item.get("content", "")}
            for item in client_messages
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ]
    else:
        conversation_history.append({"role": "user", "content": user_message})
        messages = conversation_history

    def generate():
        assistant_reply = ""

        try:
            for chunk in ollama_chat_stream(messages):
                assistant_reply += chunk
                yield chunk

            if messages is conversation_history:
                conversation_history.append({"role": "assistant", "content": assistant_reply})
        except RuntimeError as exc:
            # Remove the pending user message so a failed request does not pollute context.
            if messages is conversation_history and conversation_history and conversation_history[-1]["role"] == "user":
                conversation_history.pop()
            yield f"\n[Error] {exc}"

    return Response(generate(), mimetype="text/plain")


@app.post("/api/clear")
def clear_chat():
    """Clear the temporary server-side conversation context."""
    conversation_history.clear()
    return jsonify({"message": "Conversation cleared."})


@app.errorhandler(404)
def not_found(_):
    return jsonify({"error": "Endpoint not found."}), 404


@app.errorhandler(500)
def server_error(_):
    return jsonify({"error": "Unexpected server error."}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True, threaded=True)
