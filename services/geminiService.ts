import { GoogleGenAI, Type } from "@google/genai";
import { GraphData, GraphNode } from "../types";

const getSchemaFromAI = async (prompt: string, currentSchema: GraphData | undefined, mode: 'merge' | 'replace'): Promise<GraphData> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const systemInstruction = `
    You are an expert database architect and graph theory specialist.
    Your task is to generate or modify a database schema based on the user's request.
    The output must be a strictly valid JSON object representing a graph with 'nodes' and 'links'.
    
    IMPORTANT RULES:
    1. Return ONLY the raw JSON object. Do not wrap it in markdown code blocks.
    2. Ensure the JSON is valid and parseable.
    3. If an existing schema is provided, PRESERVE existing IDs unless instructed to delete them.
    4. If creating a new schema, use descriptive but simple IDs (e.g., 'user', 'order').
    5. CRITICAL: You MUST connect related nodes with 'links'. A schema without relationships is incomplete. Identify foreign keys or logical connections and create links for them.
    6. Ensure 'source' and 'target' in links correspond EXACTLY to node 'id's.
    7. Use standard convention uppercase for link labels (e.g., 'AUTHORED', 'CONTAINS', 'BELONGS_TO').
    
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
  `;

  // Only provide context if merging
  const simplifiedSchema = (mode === 'merge' && currentSchema) ? {
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

  let userContent = `User Request: ${prompt}`;
  
  if (simplifiedSchema) {
    userContent += `\n\nCONTEXT: The user wants to EXTEND or MODIFY the following existing schema.\n
    - Integrate new nodes/links into this structure.
    - RETURN THE FULL SCHEMA (Existing + New).
    - Do not lose existing nodes unless the user request implies deleting them.
    \nExisting Schema:\n${JSON.stringify(simplifiedSchema)}`;
  } else {
    userContent += `\n\nCONTEXT: Create a BRAND NEW schema from scratch. Ignore any previous context.`;
  }

  userContent += `\n\nREMINDER: Explicitly define all relationships between nodes in the 'links' array.`;

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
    
    // Clean potential markdown code blocks
    text = text.replace(/```json\n?|```/g, '').trim();

    try {
        const parsed = JSON.parse(text);
        return parsed as GraphData;
    } catch (parseError) {
        console.error("JSON Parse Error. Raw text:", text);
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