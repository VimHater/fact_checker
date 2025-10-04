const apiKey = "";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

const claimInput = document.getElementById('claimInput');
const factCheckButton = document.getElementById('factCheckButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultSection = document.getElementById('resultSection');
const determinationText = document.getElementById('determinationText');
const statusBox = document.getElementById('statusBox');
const analysisContent = document.getElementById('analysisContent');
const sourcesList = document.getElementById('sourcesList');
const errorModal = document.getElementById('errorModal');
const errorMessage = document.getElementById('errorMessage');

const systemPrompt = `
Bạn là một AI kiểm chứng thông tin chuyên nghiệp, trung lập, phân tích các tuyên bố dựa trên *chỉ* kết quả tìm kiếm theo thời gian thực (Google Search Grounding). Bạn **bắt buộc** phải tuân thủ nghiêm ngặt định dạng đầu ra sau:

1. **ĐỊNH DẠNG TRẠNG THÁI (BẮT BUỘC DÒNG ĐẦU TIÊN):**
    * Dòng đầu tiên phải là: **TRẠNG THÁI: [Trạng Thái Xếp Hạng]**
    * **[ĐÚNG]** nếu bằng chứng hỗ trợ tuyên bố hoặc bằng chứng phủ nhận điều ngược lại với tuyên bố.
    * **[SAI]** nếu bằng chứng mâu thuẫn mạnh mẽ với tuyên bố (bao gồm cả các tuyên bố mâu thuẫn với sự đồng thuận khoa học/lịch sử đã được thiết lập).
    * **[CẦN KIỂM TRA LẠI]** nếu có sai sót nhỏ, thông tin không rõ ràng, hoặc có sự thiếu sót đáng kể.
    * **[KHÔNG THỂ XÁC MINH]** nếu bằng chứng không đủ, mâu thuẫn cao độ, hoặc không kết luận được.

2. **NỘI DUNG PHÂN TÍCH CHI TIẾT (SỬ DỤNG TIÊU ĐỀ MARKDOWN):**
    * Ngay sau dòng TRẠNG THÁI, bạn phải cung cấp phân tích chi tiết, **sử dụng các tiêu đề markdown** cho từng bước theo yêu cầu của người dùng:

## 1. Đánh giá Nguồn
    * Chuyên môn: [Đánh giá độ tin cậy và chuyên môn của nguồn]
    * Độ tin cậy trong quá khứ: [Đánh giá tính nhất quán/độ chính xác trước đây]
    * Thiên vị tiềm ẩn: [Xác định mọi thiên vị có thể ảnh hưởng]

## 2. Đối chiếu Chéo
    * Xác nhận: [Nguồn nào ủng hộ?]
    * Mâu thuẫn: [Nguồn nào mâu thuẫn?]

## 3. Hệ thống Xếp hạng (Tổng thể)
    * Xếp hạng: [Sử dụng một trong 4 loại: Đúng/Sai sót Nhỏ/Cần Kiểm tra Lại/Sai]

## 4. Phân tích Ngữ cảnh và Tính Kịp thời
    * Ngữ cảnh bị thiếu: [Mô tả mọi sắc thái hoặc chi tiết bị thiếu]
    * Tính kịp thời: [Thông tin có lỗi thời không? Ảnh hưởng như thế nào?]

## 5. Tóm tắt Cuối cùng
    * Các lỗi/Vấn đề chính: [Tóm tắt ngắn gọn các điểm yếu]
    * Đề xuất xác minh thêm: [Đề xuất nguồn hoặc chiến lược]
    * Đánh giá tổng thể: [Nhận định chung về độ tin cậy]

3. **QUY TẮC BỔ SUNG:**
    * Không bao gồm bất kỳ lời chào đầu, văn bản đàm thoại hoặc cụm từ quảng cáo nào.
    * Đảm bảo rằng mọi kết luận đều được hỗ trợ bởi bằng chứng được tìm thấy.
`;

/**
 * Shows a custom modal error message.
 * @param {string} message The error message to display.
 */
function showCustomError(message) {
    errorMessage.textContent = message;
    errorModal.classList.remove('hidden');
    errorModal.classList.add('flex');
}

/**
 * Exponential backoff utility for API retries.
 * @param {number} attempt The current retry attempt (starting at 0).
 * @param {Function} func The function to execute.
 * @returns {Promise<any>} The result of the function.
 */
async function fetchWithBackoff(attempt, func) {
    try {
        return await func();
    } catch (error) {
        if (attempt >= 5) {
            throw new Error("Failed to connect to the AI service after multiple retries.");
        }
        const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithBackoff(attempt + 1, func);
    }
}

/**
 * Main function to handle the fact-checking process. This is called by the button's onclick handler.
 */
async function checkClaim() {
    const claim = claimInput.value.trim();
    if (claim.length < 10) {
        showCustomError("Please enter a longer claim to fact-check (at least 10 characters).");
        return;
    }

    // Reset UI
    resultSection.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    factCheckButton.disabled = true;

    const payload = {
        contents: [{ parts: [{ text: claim }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
        const response = await fetchWithBackoff(0, () => 
            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
        );

        if (!response.ok) {
            const errorJson = await response.json();
            throw new Error(errorJson.error?.message || `API request failed with status: ${response.status}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];
        const generatedText = candidate?.content?.parts?.[0]?.text;

        if (!generatedText) {
            throw new Error("Received an empty or malformed response from the AI service.");
        }

        var determination = 'KHÔNG THỂ XÁC MINH';
        //const determinationMatch = generatedText.match(/ĐÚNG/);
        if (generatedText.match(/ĐÚNG/)) {
            determination = 'ĐÚNG'
        }
        if  (generatedText.match(/SAI/)) {
            determination = 'SAI'
        }
        //const determination = determinationMatch ? determinationMatch[1].toUpperCase() : 'KHÔNG THỂ XÁC MINH';


        // 2. Extract Analysis Content
        // Loại bỏ dòng trạng thái khỏi phần phân tích
        const analysis = generatedText.replace(/TRẠNG THÁI:\s*\[(ĐÚNG|SAI|KHÔNG THỂ XÁC MINH)\]/i, '').trim();
        // 3. Extract Grounding Sources
        let sources = [];
        const groundingMetadata = candidate.groundingMetadata;
        if (groundingMetadata && groundingMetadata.groundingAttributions) {
            sources = groundingMetadata.groundingAttributions
                .map(attribution => ({
                    uri: attribution.web?.uri,
                    title: attribution.web?.title,
                }))
                .filter(source => source.uri && source.title);
        }

        // Update UI with results
        updateResultUI(determination, analysis, sources);

    } catch (error) {
        console.error("Fact Check Error:", error);
        showCustomError(error.message);
    } finally {
        loadingIndicator.classList.add('hidden');
        factCheckButton.disabled = false;
    }
}

/**
 * Renders the results into the UI.
 * @param {string} determination The True/False/Unverified status.
 * @param {string} analysis The detailed analysis text.
 * @param {Array<Object>} sources The list of citation sources.
 */
function updateResultUI(determination, analysis, sources) {
    // Update Determination Box
    determinationText.textContent = determination;
    statusBox.className = `p-4 rounded-xl border-2 mb-6 shadow-md`; // Reset classes
    
    // Apply status-specific styling (classes are defined in style.css)
    if (determination === 'TRUE') {
        statusBox.classList.add('status-true');
    } else if (determination === 'FALSE') {
        statusBox.classList.add('status-false');
    } else {
        statusBox.classList.add('status-unverified');
    }

    // Update Analysis Content
    // Convert newlines to paragraphs for better reading
    analysisContent.innerHTML = analysis.replace(/\n/g, '<p class="mb-3">');

    // Update Sources List
    sourcesList.innerHTML = '';
    if (sources.length > 0) {
        sources.forEach((source, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <a href="${source.uri}" target="_blank" class="flex items-start p-2 bg-gray-50 hover:bg-gray-100 rounded-md transition duration-150 ease-in-out">
                    <span class="font-bold text-gray-900 mr-2">[${index + 1}]</span>
                    <span class="flex-1">
                        <span class="text-blue-600 hover:text-blue-700">${source.title}</span> 
                        <span class="block text-xs text-gray-400 truncate">${source.uri}</span>
                    </span>
                </a>
            `;
            sourcesList.appendChild(li);
        });
    } else {
        sourcesList.innerHTML = '<li class="text-gray-500">No specific sources were cited in the grounded search process.</li>';
    }

    resultSection.classList.remove('hidden');
}

// Attach to the global window object so the index.html button can access it
window.checkClaim = checkClaim;
