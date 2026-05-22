import ollama

def generate_speaker_summary(full_transcript: str) -> str:
    
    system_prompt = """You are a highly professional meeting summarizer. 
Your task is to analyze the following meeting transcript and extract the core technical and business value.

STRICT RULES:
1. COMPLETELY IGNORE small talk, greetings, mic checks (e.g., 'hello', 'can you hear me', 'thank you'), and fragmented/random sentences.
2. Focus ONLY on project details, technical terms (e.g., Python, FastAPI, React, LLM), decisions, and actionable items.
3. DO NOT add any extra notes, explanations, or commentary at the end. Output exactly in the format requested.

Output Format:
**Summary**
### [Speaker Name]
* Key points discussed:
  + [Point 1]
  + [Point 2]
* Action items:
  + [Task 1]

**Translated Summary in Formal Hindi**
### [Speaker Name]
* चर्चा के प्रमुख बिंदु:
  + [Point 1]
* कार्य निर्देश या जिम्मेदारी:
  + [Task 1]
"""

    try:
       
        response = ollama.chat(model='llama3', messages=[
            {
                'role': 'system',
                'content': system_prompt
            },
            {
                'role': 'user',
                'content': f"Here is the live meeting transcript:\n\n{full_transcript}"
            }
        ])
        
        summary = response['message']['content']
        return summary
        
    except Exception as e:
        print(f"Error communicating with Ollama: {e}")
        return "Failed to generate summary. Please ensure Ollama is installed and running (`ollama pull llama3.2`)."