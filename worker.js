export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { prompt, base64DataUrl, jsonMode } = await request.json();
      const parts = [{ text: prompt }];

      if (base64DataUrl && base64DataUrl.includes(",")) {
        const [header, data] = base64DataUrl.split(",");
        const mimeMatch = header.match(/data:(.*?);base64/);
        parts.push({
          inlineData: {
            mimeType: mimeMatch ? mimeMatch[1] : "image/jpeg",
            data
          }
        });
      }

      const geminiBody = { contents: [{ parts }] };
      if (jsonMode) {
        geminiBody.generationConfig = { responseMimeType: "application/json" };
      }

      const geminiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify(geminiBody)
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        return new Response(JSON.stringify({ error: errText }), {
          status: geminiResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const result = await geminiResponse.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};