import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { twMerge } from 'tailwind-merge'; // 這裡已經修正為正確的 twMerge

// 檢查 Canvas 環境中是否提供了 Firebase 設定和 auth token
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// 主要的 App 元件
const App = () => {
    // 狀態變數
    const [imageFile, setImageFile] = useState(null); // 儲存上傳的圖片檔案
    const [prompt, setPrompt] = useState(''); // 儲存使用者輸入的提示詞
    const [response, setResponse] = useState(''); // 儲存 AI 的回應
    const [isLoading, setIsLoading] = useState(false); // 追蹤載入狀態
    const [error, setError] = useState(null); // 儲存錯誤訊息
    const [userId, setUserId] = useState(null); // 儲存使用者 ID
    const [authInitialized, setAuthInitialized] = useState(false); // 追蹤 Firebase Auth 初始狀態
    const appRef = useRef(null); // 參考 Firebase app 實例
    const authRef = useRef(null); // 參考 Firebase auth 實例

    // 在元件掛載時初始化 Firebase
    useEffect(() => {
        // 如果已經初始化過，就不要再重複執行
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

            // 使用提供的 token 登入，或匿名登入
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

    // 處理圖片上傳
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        // 這裡的 accept="image/*" 屬性確保只接受圖片檔案
        if (file) {
            setImageFile(file);
        }
    };

    // 處理提示詞輸入
    const handlePromptChange = (e) => {
        setPrompt(e.target.value);
    };

    // 處理表單提交
    const handleSubmit = async () => {
        if (!imageFile || !prompt) {
            setError("請選擇圖片並輸入提示詞。");
            return;
        }

        setIsLoading(true);
        setResponse('');
        setError(null);

        const reader = new FileReader();
        reader.readAsDataURL(imageFile);

        reader.onloadend = async () => {
            const base64ImageData = reader.result.split(',')[1];

            // 指數退避策略
            const maxRetries = 5;
            let currentRetry = 0;
            const delay = (ms) => new Promise(res => setTimeout(res, ms));

            const callApi = async () => {
                try {
                    const chatHistory = [];
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    const payload = {
                        contents: [
                            {
                                role: "user",
                                parts: [
                                    { text: prompt },
                                    {
                                        inlineData: {
                                            mimeType: "image/jpeg", // 假設上傳的是 JPEG
                                            data: base64ImageData
                                        }
                                    }
                                ]
                            }
                        ],
                    };
                    const apiKey = "";
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`API request failed with status ${response.status}`);
                    }

                    const result = await response.json();

                    if (result.candidates && result.candidates.length > 0 &&
                        result.candidates[0].content && result.candidates[0].content.parts &&
                        result.candidates[0].content.parts.length > 0) {
                        const text = result.candidates[0].content.parts[0].text;
                        setResponse(text);
                    } else {
                        throw new Error('API response format unexpected.');
                    }
                } catch (err) {
                    if (currentRetry < maxRetries) {
                        currentRetry++;
                        const backoffDelay = Math.pow(2, currentRetry) * 1000;
                        await delay(backoffDelay);
                        await callApi(); // 再次呼叫自身
                    } else {
                        console.error("Error during API call:", err);
                        setError("無法從 AI 獲取回應，請稍後再試。");
                    }
                } finally {
                    setIsLoading(false);
                }
            };
            callApi();
        };

        reader.onerror = (error) => {
            console.error("FileReader error:", error);
            setError("圖片讀取失敗。");
            setIsLoading(false);
        };
    };

    // 處理輸入框樣式
    const inputClasses = "w-full p-3 rounded-xl border-2 border-gray-300 focus:outline-none focus:border-blue-500 transition-all duration-300 bg-white shadow-sm";

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans antialiased">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-xl space-y-6 transform transition-transform duration-500 hover:scale-[1.01] border border-gray-200">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-gray-800 tracking-tight">
                    AI 圖片分析器
                </h1>

                {/* 顯示用戶ID的區域 */}
                {authInitialized && (
                    <div className="text-center text-sm text-gray-500">
                        {userId ? `目前使用者 ID: ${userId}` : "匿名登入中..."}
                    </div>
                )}

                {/* 圖片上傳區域 */}
                <div className="space-y-4">
                    <label className="block text-gray-700 font-semibold text-lg">上傳圖片</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                    />
                    {imageFile && (
                        <div className="mt-4 border-2 border-dashed border-gray-300 rounded-xl p-4 flex justify-center items-center">
                            <img src={URL.createObjectURL(imageFile)} alt="圖片預覽" className="max-w-full max-h-64 rounded-lg shadow-md" />
                        </div>
                    )}
                </div>

                {/* 提示詞輸入區域 */}
                <div className="space-y-4">
                    <label className="block text-gray-700 font-semibold text-lg">輸入提示詞</label>
                    <textarea
                        value={prompt}
                        onChange={handlePromptChange}
                        className={twMerge(inputClasses, "h-32 resize-none")}
                        placeholder="請輸入你想要 AI 做的圖片分析或任務..."
                    ></textarea>
                </div>

                {/* 提交按鈕 */}
                <button
                    onClick={handleSubmit}
                    className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50 flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            正在處理...
                        </>
                    ) : '提交'}
                </button>

                {/* 錯誤和回應顯示區域 */}
                {error && (
                    <div className="bg-red-100 text-red-700 p-4 rounded-xl border border-red-200 mt-4 text-center">
                        {error}
                    </div>
                )}
                {response && (
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 mt-4 space-y-4 shadow-inner">
                        <h2 className="text-xl font-bold text-gray-800">AI 回應</h2>
                        <div className="prose max-w-none text-gray-700 leading-relaxed">
                            {response.split('\n').map((line, index) => (
                                <p key={index} className="mb-2 last:mb-0">{line}</p>
                            ))}
                        </div>
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
