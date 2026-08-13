// server.js
// Backend de MarketSniper IA — hace de "puente" seguro entre tu página web y el modelo de IA.
// La key SOLO vive aquí, en el servidor. Nunca se envía al navegador del usuario.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Key de OpenRouter puesta directamente aquí a pedido del usuario (uso privado,
// solo él y amigos de confianza). OJO: no subas este archivo a un repo público
// ni lo compartas fuera de ese grupo, porque quien tenga este archivo tiene tu key.
const OPENROUTER_API_KEY = 'sk-NnwcXoPkcx7AXUSIBhH78OyS5kgx11OyVhmlD7LNfN32ks3U';
const MODEL = 'anthropic/claude-fable-5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

app.use(express.json({ limit: '10mb' })); // 10mb para permitir imágenes en base64
app.use(express.static(path.join(__dirname, 'public')));

// Instrucción de sistema: define el "personaje" y el trabajo del bot.
const SYSTEM_PROMPT = `Eres MarketSniper IA, un asistente experto en tasación de artículos de segunda mano
y en detectar oportunidades de compra (chollos). Cuando el usuario describe o adjunta una foto de un artículo:
- Estima un rango de valor de mercado realista (moneda según el contexto del usuario).
- Señala qué datos faltan para afinar la valoración (marca, modelo, estado, accesorios, etc.).
- Si detectas que el precio pedido es bajo respecto al valor de mercado, indícalo como posible oportunidad.
- Sé claro, breve y directo. Usa párrafos cortos, sin relleno innecesario.
- Responde siempre en español.`;

// Convierte el historial simple del frontend ({role, text}) + el mensaje actual
// al formato de mensajes estilo OpenAI que usa OpenRouter.
function buildMessages(history, message, image) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  (history || []).forEach((turn) => {
    messages.push({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content: turn.text,
    });
  });

  if (image && image.base64 && image.mimeType) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: message },
        { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: message });
  }

  return messages;
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { message, image, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Falta el mensaje a analizar.' });
    }

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(history, message, image),
        temperature: 0.6,
        max_tokens: 1024,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMessage = data?.error?.message || 'Error al conectar con el modelo.';
      console.error('[MarketSniper] Error de OpenRouter:', errMessage);
      return res.status(response.status).json({ error: errMessage });
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'El modelo no devolvió una respuesta utilizable.' });
    }

    res.json({ reply });
  } catch (error) {
    console.error('[MarketSniper] Error interno:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`MarketSniper IA escuchando en http://localhost:${PORT}`);
});
