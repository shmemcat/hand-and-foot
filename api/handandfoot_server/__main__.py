import os
from .application import create_app

app = create_app()
app.extensions["socketio"].run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "5104")), allow_unsafe_werkzeug=True)
