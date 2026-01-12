import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, GraphNode } from "../types";

const getSchemaFromAI = async (prompt: string, currentSchema?: GraphData): Promise<GraphData> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const systemInstruction = `
    You are an expert database architect and graph theory specialist.
    Your task is to generate or modify a database schema based on the user's request.
    The output must be a strictly valid JSON object representing a graph with 'nodes' and 'links'.
    
    IMPORTANT: 
    1. Return ONLY the raw JSON object. Do not wrap it in markdown code blocks (e.g., \`\`\`json).
    2. Ensure the JSON is valid and parseable.
    
    Node structure:
    {
      id: string (unique),
      label: string (human readable name),
      type: 'node' | 'table' | 'document',
      properties: [{ id: string, key: string, value: string, type: string }]
    }

    Link structure:
    {
      id: string (unique),
      source: string (id of source node),
      target: string (id of target node),
      label: string (relationship name, e.g., 'AUTHORED', 'CONTAINS')
    }

    Ensure IDs are unique string values (e.g., 'n1', 'n2').
    Be creative but realistic with properties.
  `;

  // Sanitize and simplify schema to avoid circular references from D3 and reduce input token usage
  // D3 converts source/target to objects, so we must extract the IDs for the prompt
  const simplifiedSchema = currentSchema ? {
    nodes: currentSchema.nodes.map(n => ({
        id: n.id, 
        label: n.label, 
        type: n.type, 
        properties: n.properties || []
    })),
    links: currentSchema.links.map(l => ({ 
        id: l.id, 
        source: typeof l.source === 'object' ? (l.source as GraphNode).id : l.source, 
        target: typeof l.target === 'object' ? (l.target as GraphNode).id : l.target, 
        label: l.label 
    }))
  } : null;

  let userContent = `Create a schema for: ${prompt}`;
  
  if (simplifiedSchema) {
    userContent += `\n\nBased on the following existing schema (preserve existing IDs if possible, or extend): \n${JSON.stringify(simplifiedSchema)}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: userContent,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens: 20000, 
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                nodes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            type: { type: Type.STRING, enum: ['node', 'table', 'document'] },
                            properties: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        id: { type: Type.STRING },
                                        key: { type: Type.STRING },
                                        value: { type: Type.STRING },
                                        type: { type: Type.STRING }
                                    }
                                }
                            }
                        },
                        required: ['id', 'label', 'type']
                    }
                },
                links: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            source: { type: Type.STRING },
                            target: { type: Type.STRING },
                            label: { type: Type.STRING }
                        },
                        required: ['id', 'source', 'target', 'label']
                    }
                }
            }
        }
      }
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");
    
    // Clean potential markdown code blocks if the model ignores the instruction
    text = text.replace(/```json\n?|```/g, '').trim();

    try {
        const parsed = JSON.parse(text);
        return parsed as GraphData;
    } catch (parseError) {
        console.error("JSON Parse Error. Raw text:", text);
        // Attempt to salvage valid JSON from a potentially messy response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]) as GraphData;
            } catch (e) {
                throw new Error("The AI response was invalid JSON. Please try again.");
            }
        }
        throw new Error("The AI response was incomplete or invalid JSON. Please try a smaller scope or query.");
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const geminiService = {
  getSchemaFromAI
};