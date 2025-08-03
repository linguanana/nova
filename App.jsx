// App.jsx
// 主應用程式元件
const App = () => {
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm w-full">
                <h1 className="text-4xl font-bold text-blue-600 mb-4">Hello World!</h1>
                <p className="text-gray-700">這是一個使用 React 和 Tailwind CSS 建立的簡單網站。</p>
                <a
                    href="https://github.com/linguanana"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-block bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-600 transition-colors"
                >
                    前往我的 GitHub
                </a>
            </div>
        </div>
    );
};

// 渲染應用程式
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
