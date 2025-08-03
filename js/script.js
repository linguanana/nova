import { useState, useEffect } from 'react';

// Base64 to ArrayBuffer utility function
const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

// PCM to WAV Blob utility function
const pcmToWav = (pcmData, sampleRate) => {
    const dataView = new DataView(new ArrayBuffer(44 + pcmData.length));
    let offset = 0;

    // RIFF chunk descriptor
    writeString(dataView, offset, 'RIFF');
    offset += 4;
    dataView.setUint32(offset, 36 + pcmData.length, true);
    offset += 4;
    writeString(dataView, offset, 'WAVE');
    offset += 4;

    // fmt chunk
    writeString(dataView, offset, 'fmt ');
    offset += 4;
    dataView.setUint32(offset, 16, true);
    offset += 4;
    dataView.setUint16(offset, 1, true); // Audio format (1 = PCM)
    offset += 2;
    dataView.setUint16(offset, 1, true); // Number of channels
    offset += 2;
    dataView.setUint32(offset, sampleRate, true);
    offset += 4;
    dataView.setUint32(offset, sampleRate * 2, true); // Byte rate
    offset += 4;
    dataView.setUint16(offset, 2, true); // Block align
    offset += 2;
    dataView.setUint16(offset, 16, true); // Bits per sample
    offset += 2;

    // data chunk
    writeString(dataView, offset, 'data');
    offset += 4;
    dataView.setUint32(offset, pcmData.length, true);
    offset += 4;

    // Write the PCM data
    for (let i = 0; i < pcmData.length; i++) {
        dataView.setUint8(offset + i, pcmData[i]);
    }

    return new Blob([dataView], { type: 'audio/wav' });
};

// Helper function to write string to DataView
const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

// Custom fetch with exponential backoff for retries
const exponentialBackoffFetch = async (url, options, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && i < retries - 1) { // 429 Too Many Requests
                await new Promise(resolve => setTimeout(resolve, delay * (2 ** i)));
                continue;
            }
            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }
            return response;
        } catch (error) {
            if (i === retries - 1) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delay * (2 ** i)));
        }
    }
};

function App() {
    const [text, setText] = useState('');
    const [voice, setVoice] = useState('Kore');
    const [audioUrl, setAudioUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Predefined list of voices
    const voices = [
        { name: 'Kore', label: 'Kore (Firm)' },
        { name: 'Puck', label: 'Puck (Upbeat)' },
        { name: 'Charon', label: 'Charon (Informative)' },
        { name: 'Zephyr', label: 'Zephyr (Bright)' },
        { name: 'Fenrir', label: 'Fenrir (Excitable)' },
        { name: 'Leda', label: 'Leda (Youthful)' },
    ];

    const handleGenerateAudio = async () => {
        setLoading(true);
        setError('');
        setAudioUrl('');

        const prompt = `Say in a natural tone: ${text}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        const apiKey = ""; // Canvas will provide this
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        try {
            const response = await exponentialBackoffFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const part = result?.candidates?.[0]?.content?.parts?.[0];
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                const pcmData = base64ToArrayBuffer(audioData);
                const pcm16 = new Int16Array(pcmData);

                // The API returns PCM-16 raw data, which needs to be packaged into a WAV file.
                // We'll use a sample rate of 16000Hz as it's a common default for speech.
                const sampleRate = 16000;
                const wavBlob = pcmToWav(new Uint8Array(pcmData), sampleRate);
                const url = URL.createObjectURL(wavBlob);
                setAudioUrl(url);
            } else {
                setError('Failed to generate audio. Please try again.');
            }
        } catch (err) {
            console.error(err);
            setError(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl border border-gray-200">
                <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-2">
                    語音與字幕生成器
                </h1>
                <p className="text-center text-gray-500 mb-8">
                    輸入文字，選擇一個聲音，然後生成語音。
                </p>

                {/* Text Input Area */}
                <div className="mb-6">
                    <label htmlFor="text-input" className="block text-sm font-medium text-gray-700 mb-2">
                        輸入您的文字
                    </label>
                    <textarea
                        id="text-input"
                        className="w-full p-4 h-40 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                        placeholder="請在這裡輸入您的文字..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={loading}
                    ></textarea>
                </div>

                {/* Voice Selector */}
                <div className="mb-6">
                    <label htmlFor="voice-selector" className="block text-sm font-medium text-gray-700 mb-2">
                        選擇一個聲音
                    </label>
                    <select
                        id="voice-selector"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        disabled={loading}
                    >
                        {voices.map((v) => (
                            <option key={v.name} value={v.name}>
                                {v.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Generate Button */}
                <div className="mb-6">
                    <button
                        onClick={handleGenerateAudio}
                        disabled={loading || !text.trim()}
                        className={`w-full py-4 px-6 rounded-lg font-bold text-white transition-all duration-200
                            ${loading || !text.trim()
                                ? 'bg-indigo-300 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                            }`}
                    >
                        {loading ? '正在生成中...' : '生成音訊'}
                    </button>
                </div>

                {/* Audio Player and Loading/Error States */}
                {loading && (
                    <div className="flex justify-center items-center py-4">
                        <svg className="animate-spin h-6 w-6 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="ml-3 text-gray-600">正在生成語音，這可能需要幾秒鐘...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-100 text-red-700 rounded-lg mb-6 text-center">
                        <p>{error}</p>
                    </div>
                )}

                {audioUrl && (
                    <div className="p-4 bg-gray-100 rounded-lg">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">已生成的音訊</h3>
                        <audio controls src={audioUrl} className="w-full"></audio>
                    </div>
                )}
            </div>
        </div>
    );
}

// Render the App component into the root div
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Cleanup function to revoke the audio URL
useEffect(() => {
    return () => {
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
    };
}, [audioUrl]);

export default App;
