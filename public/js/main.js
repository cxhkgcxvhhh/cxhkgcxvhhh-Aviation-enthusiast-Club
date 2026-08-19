// 檢查登入狀態
async function checkAuth() {
    try {
        const res = await fetch('/auth/user');
        const data = await res.json();
        return data;
    } catch (e) {
        return { loggedIn: false };
    }
}

// 顯示已審核照片（首頁）
async function loadPhotos() {
    const container = document.getElementById('photos-grid');
    if (!container) return;
    
    try {
        const res = await fetch('/api/photos');
        const photos = await res.json();
        
        if (photos.length === 0) {
            container.innerHTML = '<p class="loading">暫無照片</p>';
            return;
        }
        
        const auth = await checkAuth();
        
        container.innerHTML = photos.map(photo => `
            <div class="photo-card" data-id="${photo.id}">
                <img src="${photo.photo_path}" alt="飛機照片">
                <div class="photo-info">
                    <h3>${photo.airline}</h3>
                    <div class="photo-meta">目的地：${photo.destination} (${photo.destination_code})</div>
                    <div class="photo-meta">註冊號：${photo.aircraft_registration}</div>
                    <div class="photo-meta">航班：${photo.flight_number}</div>
                    ${photo.aircraft_model ? `<div class="photo-meta">型號：${photo.aircraft_model}</div>` : ''}
                    ${photo.engine_type ? `<div class="photo-meta">引擎：${photo.engine_type}</div>` : ''}
                    <div class="photo-meta">上傳者：${photo.display_name}</div>
                    <div class="photo-actions">
                        <button onclick="toggleLike(${photo.id})" id="like-${photo.id}">
                            ❤️ ${photo.likes_count}
                        </button>
                        <button onclick="toggleFavorite(${photo.id})" id="fav-${photo.id}">
                            ⭐ ${photo.favorites_count}
                        </button>
                    </div>
                    <div class="comments-section" id="comments-${photo.id}">
                        <div id="comments-list-${photo.id}"></div>
                        ${auth.loggedIn ? `
                            <input type="text" id="comment-input-${photo.id}" placeholder="寫評論...">
                            <button onclick="addComment(${photo.id})">發送</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
        
        // 載入每張照片嘅評論
        photos.forEach(photo => loadComments(photo.id));
        
    } catch (error) {
        container.innerHTML = '<p class="loading">載入失敗</p>';
    }
}

// 顯示待審核照片（管理員頁面）
async function loadPendingPhotos() {
    const container = document.getElementById('pending-photos');
    if (!container) return;
    
    try {
        const res = await fetch('/api/photos/pending');
        const photos = await res.json();
        
        if (photos.length === 0) {
            container.innerHTML = '<p class="loading">沒有待審核照片</p>';
            return;
        }
        
        container.innerHTML = photos.map(photo => `
            <div class="photo-card" data-id="${photo.id}">
                <img src="${photo.photo_path}" alt="飛機照片">
                <div class="photo-info">
                    <h3>${photo.airline}</h3>
                    <div class="photo-meta">目的地：${photo.destination} (${photo.destination_code})</div>
                    <div class="photo-meta">註冊號：${photo.aircraft_registration}</div>
                    <div class="photo-meta">航班：${photo.flight_number}</div>
                    ${photo.aircraft_model ? `<div class="photo-meta">型號：${photo.aircraft_model}</div>` : ''}
                    ${photo.engine_type ? `<div class="photo-meta">引擎：${photo.engine_type}</div>` : ''}
                    <div class="photo-meta">上傳者：${photo.display_name}</div>
                    <div class="review-buttons">
                        <button class="btn-approve" onclick="reviewPhoto(${photo.id}, 'approved')">✅ 通過</button>
                        <button class="btn-reject" onclick="reviewPhoto(${photo.id}, 'rejected')">❌ 拒絕</button>
                    </div>
                    <input type="text" class="rejection-reason" id="reason-${photo.id}" placeholder="拒絕原因（如適用）">
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = '<p class="loading">載入失敗</p>';
    }
}

// 審核照片
async function reviewPhoto(photoId, status) {
    const reason = document.getElementById(`reason-${photoId}`)?.value || '';
    
    try {
        const res = await fetch(`/api/photos/review/${photoId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, rejection_reason: reason })
        });
        
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadPendingPhotos(); // 重新載入
        } else {
            alert('審核失敗：' + data.error);
        }
    } catch (error) {
        alert('審核失敗');
    }
}

// 按讚
async function toggleLike(photoId) {
    try {
        const res = await fetch(`/api/photos/${photoId}/like`, { method: 'POST' });
        const data = await res.json();
        if (data.success) loadPhotos();
    } catch (error) {
        alert('請先登入');
    }
}

// 收藏
async function toggleFavorite(photoId) {
    try {
        const res = await fetch(`/api/photos/${photoId}/favorite`, { method: 'POST' });
        const data = await res.json();
        if (data.success) loadPhotos();
    } catch (error) {
        alert('請先登入');
    }
}

// 載入評論
async function loadComments(photoId) {
    try {
        const res = await fetch(`/api/photos/${photoId}/comments`);
        const comments = await res.json();
        
        const container = document.getElementById(`comments-list-${photoId}`);
        if (!container) return;
        
        if (comments.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:12px;">暫無評論</p>';
            return;
        }
        
        container.innerHTML = comments.map(c => `
            <div style="border-bottom:1px solid #eee;padding:5px 0;">
                <strong>${c.display_name}</strong>: ${c.content}
                <div style="font-size:11px;color:#999;">${new Date(c.created_at).toLocaleString()}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('載入評論失敗', error);
    }
}

// 新增評論
async function addComment(photoId) {
    const input = document.getElementById(`comment-input-${photoId}`);
    const content = input.value.trim();
    if (!content) return;
    
    try {
        const res = await fetch(`/api/photos/${photoId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        
        const data = await res.json();
        if (data.success) {
            input.value = '';
            loadComments(photoId);
        }
    } catch (error) {
        alert('發送失敗');
    }
}

// 上載照片表單
function setupUploadForm() {
    const form = document.getElementById('upload-form');
    if (!form) return;
    
    // 自動搜尋引擎型號按鈕
    const autoFillBtn = document.getElementById('auto-fill-engine');
    if (autoFillBtn) {
        autoFillBtn.addEventListener('click', async () => {
            const reg = document.querySelector('input[name="aircraft_registration"]').value;
            const model = document.querySelector('input[name="aircraft_model"]').value;
            
            if (!reg && !model) {
                alert('請先輸入飛機註冊號或型號');
                return;
            }
            
            // 簡單示範：根據型號推測引擎（實際可接 API）
            const engineMap = {
                'A320': 'CFM56-5B / V2500',
                'A321': 'CFM56-5B / V2500',
                'A330': 'Trent 700 / CF6-80E',
                'A350': 'Trent XWB',
                'B737': 'CFM56-7B',
                'B747': 'GEnx-2B / Trent 1000',
                'B777': 'GE90-115B / Trent 800',
                'B787': 'GEnx / Trent 1000'
            };
            
            let engine = '未知引擎型號';
            for (const [key, value] of Object.entries(engineMap)) {
                if (model && model.toUpperCase().includes(key)) {
                    engine = value;
                    break;
                }
            }
            
            document.getElementById('engine-type').value = engine;
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const msgDiv = document.getElementById('upload-message');
        
        try {
            const res = await fetch('/api/photos/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            msgDiv.style.display = 'block';
            if (data.success) {
                msgDiv.className = 'success';
                msgDiv.textContent = data.message;
                form.reset();
            } else {
                msgDiv.className = 'error';
                msgDiv.textContent = '上載失敗：' + data.error;
            }
            
        } catch (error) {
            msgDiv.style.display = 'block';
            msgDiv.className = 'error';
            msgDiv.textContent = '上載失敗，請重試';
        }
    });
}

// 頁面載入時執行
document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    loadPendingPhotos();
    setupUploadForm();
});