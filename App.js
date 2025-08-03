mport { useState, useEffect } from 'react';
import {
    Upload, Link, Globe, PlayCircle, Download, FileText, Loader, XCircle, ChevronDown
} from 'lucide-react';

const languageOptions = [
    { value: 'de-DE', label: '德語 (German)' },
    { value: 'fr-FR', label: '法語 (French)' },
    { value: 'ja-JP', label: '日語 (Japanese)' },
    { value: 'ko-KR', label: '韓語 (Korean)' },
    { value: 'es-US', label: '西班牙語 (Spanish)' },
];

// Helper functions for audio processing (same as previous example)
const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

const pcmToWav = (pcm16, sampleRate) => {
    const dataLength = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);
    let offset = 0;

    const writeString = (str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset++, str.charCodeAt(i));
        }
    };

    writeString('RIFF');
    view.setUint32(offset, 36 + dataLength, true); offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString('data');
    view.setUint32(offset, dataLength, true); offset += 4;

    for (let i = 0; i < pcm16.length; i++, offset += 2) {
        view.setInt16(offset, pcm16[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
};

// Main App Component
const App = () => {
    const [file, setFile] = useState(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [targetLang, setTargetLang] = useState('de-DE');
    const [isLoading, setIsLoading] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');
    const [error, setError] = useState('');
    const [translatedAudioUrl, setTranslatedAudioUrl] = useState(null);
    const [srtContent, setSrtContent] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
        setYoutubeUrl('');
    };

    const handleYoutubeChange = (e) => {
        setYoutubeUrl(e.target.value);
        setFile(null);
    };

    const handleTranslate = async () => {
        setError('');
        setIsLoading(true);
        setTranslatedAudioUrl(null);
        setSrtContent('');
        setProgressMessage('正在啟動處理程序...');

        // IMPORTANT: In a real-world application, this entire process would be handled by a secure backend server.
        // The front-end would only send the file/URL and target language to the backend.
        // The backend would handle API keys, file processing, and API calls.
        // Here, we simulate the process and show how it would work in a real app.

        try {
            // Step 1: Backend process - Fetch/Transcribe the audio
            // A real backend would:
            // - If file: Receive the MP3 upload.
            // - If YouTube URL: Use the YouTube API to download the video's audio track.
            // - Use an ASR (Automatic Speech Recognition) model to transcribe the audio to text and get timestamps.
            // For this demo, we'll use a mock transcription.
            setProgressMessage('正在下載音訊並進行語音轉文字...');
            const mockTranscription = "Hello everyone, and welcome to today's lesson. We will be learning about the solar system and the planets within it. It's a fascinating topic that helps us understand our place in the universe. Let's get started!";
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay

            // Step 2: Translate the transcribed text using Gemini LLM
            setProgressMessage('正在將文本翻譯成目標語言...');
            const translationPrompt = `將這段文字翻譯成語言代碼為 "${targetLang}" 的語言。僅回傳翻譯後的內容，不要有任何其他文字。原文：\n\n${mockTranscription}`;
            const translationPayload = {
                contents: [{ role: "user", parts: [{ text: translationPrompt }] }],
            };

            const translationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(translationPayload)
            });
            const translationResult = await translationResponse.json();

            if (!translationResult.candidates || !translationResult.candidates[0].content.parts[0].text) {
                throw new Error("翻譯失敗，請再試一次。");
            }
            const translatedText = translationResult.candidates[0].content.parts[0].text;

            // Step 3: Generate TTS audio for the translated text
            setProgressMessage('正在生成翻譯後的語音...');
            const audioPayload = {
                contents: [{ parts: [{ text: translatedText }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Kore" }
                        }
                    }
                },
                model: "gemini-2.5-flash-preview-tts"
            };

            const audioResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioPayload)
            });
            const audioResult = await audioResponse.json();

            if (!audioResult.candidates || !audioResult.candidates[0].content.parts[0].inlineData) {
                throw new Error("語音生成失敗，請再試一次。");
            }
            const audioData = audioResult.candidates[0].content.parts[0].inlineData.data;
            const pcmData = base64ToArrayBuffer(audioData);
            const pcm16 = new Int16Array(pcmData);
            const sampleRate = 24000;
            const wavBlob = pcmToWav(pcm16, sampleRate);
            const url = URL.createObjectURL(wavBlob);
            setTranslatedAudioUrl(url);

            // Step 4: Generate SRT subtitle file
            // A real backend would use the timestamps from the ASR step and the translated text
            // to create a proper SRT file. For this demo, we'll create a simple one.
            setProgressMessage('正在生成 SRT 字幕檔案...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
            const srt = `1
00:00:00,000 --> 00:00:05,000
${translatedText.replace(/\n/g, ' ')}
            `;
            setSrtContent(srt);

            setProgressMessage('處理完成！');
        } catch (e) {
            console.error("處理失敗:", e);
            setError(`處理失敗: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayAudio = () => {
        if (!translatedAudioUrl) return;
        const audio = new Audio(translatedAudioUrl);
        audio.onplay = () => setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
        audio.play().catch(e => {
            console.error("Audio playback error:", e);
            setError("無法播放音訊，請確認瀏覽器權限。");
        });
    };

    const handleDownload = (content, filename, mimeType) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-gray-50 min-h-screen p-8 flex flex-col items-center font-sans text-gray-800">
            <div className="max-w-3xl w-full bg-white rounded-3xl shadow-2xl p-8 space-y-8">
                <h1 className="text-4xl font-extrabold text-center text-indigo-600 tracking-wide">
                    多語言音訊影片翻譯服務
                </h1>
                <p className="text-center text-lg text-gray-600">
                    上傳 MP3 檔案或輸入 YouTube 連結，並選擇目標語言，即可自動生成翻譯後的音訊和 SRT 字幕。
                </p>

                {/* Input Selection */}
                <div className="flex flex-col space-y-4">
                    <div className="bg-gray-100 p-6 rounded-2xl flex flex-col space-y-4">
                        <label className="flex items-center text-xl font-semibold text-gray-700">
                            <Upload className="mr-3" />
                            輸入方式 1: 上傳 MP3 檔案
                        </label>
                        <input
                            type="file"
                            accept=".mp3"
                            onChange={handleFileChange}
                            className="text-lg file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-lg file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-600 transition-colors cursor-pointer"
                        />
                    </div>

                    <div className="text-center text-2xl font-bold text-gray-400">或</div>

                    <div className="bg-gray-100 p-6 rounded-2xl flex flex-col space-y-4">
                        <label className="flex items-center text-xl font-semibold text-gray-700">
                            <Link className="mr-3" />
                            輸入方式 2: YouTube 連結
                        </label>
                        <input
                            type="text"
                            value={youtubeUrl}
                            onChange={handleYoutubeChange}
                            placeholder="例如：https://www.youtube.com/watch?v=..."
                            className="p-4 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-lg"
                        />
                    </div>
                </div>

                {/* Language Selection */}
                <div className="flex flex-col space-y-4">
                    <label htmlFor="language-select" className="flex items-center text-xl font-semibold text-gray-700">
                        <Globe className="mr-3" />
                        選擇目標語言
                    </label>
                    <div className="relative">
                        <select
                            id="language-select"
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="block w-full p-4 border-2 border-gray-300 rounded-xl appearance-none bg-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 pr-10"
                        >
                            {languageOptions.map(lang => (
                                <option key={lang.value} value={lang.value}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <ChevronDown className="h-6 w-6" />
                        </div>
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleTranslate}
                    disabled={isLoading || (!file && !youtubeUrl)}
                    className="w-full py-4 px-6 bg-indigo-600 text-white font-bold text-xl rounded-xl shadow-lg hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors duration-200 ease-in-out transform hover:scale-105 active:scale-100 flex items-center justify-center space-x-2"
                >
                    {isLoading ? (
                        <>
                            <Loader className="animate-spin" />
                            <span>{progressMessage}</span>
                        </>
                    ) : (
                        <span>開始翻譯和生成</span>
                    )}
                </button>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg flex items-start space-x-3">
                        <XCircle className="mt-1 flex-shrink-0" />
                        <p className="font-bold">發生錯誤：</p>
                        <p>{error}</p>
                    </div>
                )}

                {/* Results Display */}
                {(translatedAudioUrl || srtContent) && (
                    <div className="bg-green-50 p-6 rounded-2xl border-2 border-green-200 space-y-4">
                        <h2 className="text-2xl font-bold text-green-800 text-center">處理完成！</h2>
                        <p className="text-lg text-center text-gray-700">您可以下載或預覽生成的檔案。</p>

                        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4 mt-6">
                            {translatedAudioUrl && (
                                <div className="flex flex-col items-center space-y-2">
                                    <button
                                        onClick={handlePlayAudio}
                                        className="py-3 px-6 bg-blue-500 text-white font-bold text-lg rounded-xl shadow-md hover:bg-blue-600 transition-colors flex items-center space-x-2"
                                        disabled={isPlaying}
                                    >
                                        <PlayCircle />
                                        <span>{isPlaying ? '播放中...' : '播放翻譯音訊'}</span>
                                    </button>
                                    <a
                                        href={translatedAudioUrl}
                                        download="translated_audio.wav"
                                        className="py-3 px-6 bg-green-500 text-white font-bold text-lg rounded-xl shadow-md hover:bg-green-600 transition-colors flex items-center space-x-2"
                                    >
                                        <Download />
                                        <span>下載翻譯音訊 (WAV)</span>
                                    </a>
                                </div>
                            )}

                            {srtContent && (
                                <a
                                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(srtContent)}`}
                                    download="subtitles.srt"
                                    className="py-3 px-6 bg-purple-500 text-white font-bold text-lg rounded-xl shadow-md hover:bg-purple-600 transition-colors flex items-center space-x-2"
                                >
                                    <FileText />
                                    <span>下載 SRT 字幕檔</span>
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
