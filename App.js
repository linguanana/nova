import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { twMerge } from 'tailwind-merge';

// Helper function to convert base64 to ArrayBuffer
const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to create a WAV file from PCM data
const pcmToWav = (pcmData, sampleRate) => {
  const dataLength = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const pcm16 = new Int16Array(pcmData);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channels * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataLength, true);

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};

// Helper function for writing strings to a DataView
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Supported languages and their corresponding voice configurations
const supportedLanguages = [
    { code: 'zh-TW', name: '中文 (台灣)', voiceName: 'Kore' },
    { code: 'en-US', name: 'English (US)', voiceName: 'Zephyr' },
    { code: 'ja-JP', name: '日本語', voiceName: 'Puck' },
    { code: 'ko-KR', name: '한국어', voiceName: 'Charon' },
    { code: 'es-US', name: 'Español (US)', voiceName: 'Fenrir' },
    { code: 'fr-FR', name: 'Français', voiceName: 'Leda' },
    { code: 'de-DE', name: 'Deutsch', voiceName: 'Orus' },
];

// Firebase configuration from the Canvas environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The main application component
const App = () => {
    const [inputValue, setInputValue] = useState('');
    const [selectedLanguage, setSelectedLanguage] = useState(supportedLanguages[0].code);
    const [audioUrl, setAudioUrl] = useState(null);
    const [srtUrl, setSrtUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [userId, setUserId] = useState(null);
    const [authInitialized, setAuthInitialized] = useState(false);
    const appRef = useRef(null);
    const authRef = useRef(null);

    // Initialize Firebase and handle authentication
    useEffect(() => {
        if (appRef.current) return;

        try {
            const firebaseApp = initializeApp(firebaseConfig);
            const authInstance = getAuth(firebaseApp);

            appRef.current = firebaseApp;
            authRef.current = authInstance;

            const unsubscribe = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    setUserId(null);
                }
                setAuthInitialized(true);
            });

            const signIn = async () => {
                if (initialAuthToken) {
                    await signInWithCustomToken(authInstance, initialAuthToken);
                } else {
                    await signInAnonymously(authInstance);
                }
            };
            signIn();

            return () => unsubscribe();
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError("Firebase initialization failed.");
            setAuthInitialized(true);
        }
    }, []);

    // Handles content fetching and generation
    const handleGenerate = async () => {
        if (!inputValue.trim()) {
            setError("請輸入內容或 GitHub URL。");
            return;
        }

        setIsLoading(true);
        setAudioUrl(null);
        setSrtUrl(null);
        setError(null);

        try {
            let textContent = inputValue.trim();

            // Check if the input is a GitHub URL
            if (inputValue.startsWith('https://github.com/')) {
                // Fetch the content from the GitHub raw URL
                const rawUrl = inputValue
                    .replace('github.com', 'raw.githubusercontent.com')
                    .replace('/blob/', '/');

                const response = await fetch(rawUrl);
                if (!response.ok) {
                    throw new Error(`無法從 GitHub 獲取檔案，狀態碼: ${response.status}`);
                }
                textContent = await response.text();
            }

            if (!textContent) {
                throw new Error("無法從提供的內容或 URL 擷取文字。");
            }

            const selectedVoiceConfig = supportedLanguages.find(lang => lang.code === selectedLanguage);
            if (!selectedVoiceConfig) {
                throw new Error("無效的語言選擇。");
            }

            // Generate Audio
            const audioPayload = {
                contents: [{ parts: [{ text: textContent }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: selectedVoiceConfig.voiceName }
                        }
                    },
                },
                model: "gemini-2.5-flash-preview-tts"
            };

            const audioApiKey = "";
            const audioApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${audioApiKey}`;

            const audioResponse = await fetch(audioApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioPayload)
            });

            if (!audioResponse.ok) {
                throw new Error(`TTS API request failed with status ${audioResponse.status}`);
            }

            const audioResult = await audioResponse.json();
            const part = audioResult?.candidates?.[0]?.content?.parts?.[0];
            const audioData = part?.inlineData?.data;
            const mimeType = part?.inlineData?.mimeType;

            if (audioData && mimeType && mimeType.startsWith("audio/")) {
                const sampleRate = 16000; // API returns 16kHz PCM audio
                const pcmData = base64ToArrayBuffer(audioData);
                const wavBlob = pcmToWav(pcmData, sampleRate);
                const url = URL.createObjectURL(wavBlob);
                setAudioUrl(url);
            } else {
                throw new Error('TTS API 回應格式不正確。');
            }

            // Generate SRT
            const srtContent = generateSrt(textContent);
            const srtBlob = new Blob([srtContent], { type: 'text/plain' });
            const srtUrl = URL.createObjectURL(srtBlob);
            setSrtUrl(srtUrl);

        } catch (err) {
            console.error("生成錯誤:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper function to generate SRT content (simplified)
    const generateSrt = (text) => {
        const sentences = text.match(/[^.!?\n\r]+[.!?\n\r]*/g) || [text];
        let srt = '';
        let time = 0;
        const durationPerSentence = 3000; // 假設每句3秒

        sentences.forEach((sentence, index) => {
            const startTime = time;
            time += durationPerSentence;
            const endTime = time;

            const formatTime = (ms) => {
                const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
                const m = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
                const msPart = (ms % 1000).toString().padStart(3, '0');
                return `${h}:${m}:${s},${msPart}`;
            };

            srt += `${index + 1}\n`;
            srt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
            srt += `${sentence.trim()}\n\n`;
        });

        return srt;
    };

    const inputClasses = "w-full p-3 rounded-xl border-2 border-gray-300 focus:outline-none focus:border-blue-500 transition-all duration-300 bg-white shadow-sm";

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans antialiased">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-xl space-y-6 transform transition-transform duration-500 hover:scale-[1.01] border border-gray-200">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-gray-800 tracking-tight">
                    簡易語音與字幕生成器
                </h1>

                {authInitialized && (
                    <div className="text-center text-sm text-gray-500">
                        目前使用者 ID: {userId ? userId : "匿名使用者"}
                    </div>
                )}

                <div className="space-y-4">
                    <label className="block text-gray-700 font-semibold text-lg">
                        輸入內容或 GitHub URL
                    </label>
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className={twMerge(inputClasses, "h-40 resize-none")}
                        placeholder="請貼上文字或 GitHub 文件 URL (例如: .txt, .md)..."
                    ></textarea>
                </div>

                <div className="space-y-4">
                    <label className="block text-gray-700 font-semibold text-lg">
                        選擇語言
                    </label>
                    <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className={inputClasses}
                    >
                        {supportedLanguages.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleGenerate}
                    className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            正在生成中...
                        </>
                    ) : '生成語音與字幕'}
                </button>

                {error && (
                    <div className="bg-red-100 text-red-700 p-4 rounded-xl border border-red-200 mt-4 text-center">
                        {error}
                    </div>
                )}

                {(audioUrl || srtUrl) && (
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mt-4 space-y-4 shadow-inner">
                        <h2 className="text-xl font-bold text-gray-800">生成結果</h2>
                        <div className="flex flex-col sm:flex-row gap-4">
                            {audioUrl && (
                                <a
                                    href={audioUrl}
                                    download="generated_audio.wav"
                                    className="flex-1 px-6 py-3 text-center bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 transition-colors"
                                >
                                    下載 WAV 語音
                                </a>
                            )}
                            {srtUrl && (
                                <a
                                    href={srtUrl}
                                    download="generated_subtitles.srt"
                                    className="flex-1 px-6 py-3 text-center bg-purple-600 text-white font-bold rounded-xl shadow-lg hover:bg-purple-700 transition-colors"
                                >
                                    下載 SRT 字幕
                                </a>
                            )}
                        </div>
                        {audioUrl && (
                            <div className="mt-4">
                                <h3 className="text-md font-bold text-gray-800">預覽音訊</h3>
                                <audio controls className="w-full mt-2 rounded-xl">
                                    <source src={audioUrl} type="audio/wav" />
                                    您的瀏覽器不支援音訊元素。
                                </audio>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// 渲染應用程式
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

export default App;
