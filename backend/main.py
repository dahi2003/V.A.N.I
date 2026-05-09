from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.websocket_routes import router as websocket_router # <--- NAYA IMPORT

app = FastAPI(title="V.A.N.I. Live AI Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router) 

@app.get("/")
async def health_check():
    return {"status": "success", "message": "V.A.N.I. Live Engine is active and waiting for WebSockets."}