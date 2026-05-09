import ollama

def generate_speaker_summary(transcript_text: str) -> str:
    """
    Sends the compiled live meeting transcript to local Llama-3.2 for a structured summary.
    """
    if not transcript_text.strip():
        return "No transcript data available to summarize. The meeting was silent."

    print("\n[LLM] Waking up Llama-3.2 for Live Meeting Summarization...")
    
    system_prompt = """
    You are V.A.N.I., an expert executive meeting analyst. 
    Read the following meeting transcript carefully. 
    
    Create a dedicated summary for EVERY individual speaker. 
    For each speaker, explicitly list:
    1. Key points discussed.
    2. Action items or tasks they took responsibility for.
    
    Format the output cleanly using Markdown.
    Crucial: First output the entire structured summary in English. Then, output the exact same structured summary translated into formal Hindi.
    """
    
    try:
        response = ollama.chat(model='llama3', messages=[
            {
                'role': 'system',
                'content': system_prompt
            },
            {
                'role': 'user',
                'content': f"Here is the live meeting transcript:\n\n{transcript_text}"
            }
        ])
        
        summary = response['message']['content']
        return summary
        
    except Exception as e:
        print(f"Error communicating with Ollama: {e}")
        return "Failed to generate summary. Please ensure Ollama is installed and running (`ollama pull llama3.2`)."