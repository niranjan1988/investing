// comments.js

document.addEventListener('DOMContentLoaded', () => {
    const tickerSelect = document.getElementById('tickerSelect');
    const commentInput = document.getElementById('commentInput');
    const addCommentForm = document.getElementById('addCommentForm');
    const commentsTableBody = document.getElementById('commentsTableBody');
    const noComments = document.getElementById('noComments');
    const tableContainer = document.getElementById('commentsTableContainer');

    // Load tickers for dropdown
    async function loadTickers() {
        try {
            const response = await fetch('/api/stocks');
            if (response.ok) {
                const data = await response.json();
                const stocks = data.stocks || [];
                
                // Sort alphabetically
                stocks.sort((a, b) => a.ticker.localeCompare(b.ticker));
                
                tickerSelect.innerHTML = '<option value="" disabled selected>Select a stock...</option>';
                stocks.forEach(stock => {
                    const option = document.createElement('option');
                    option.value = stock.ticker;
                    option.textContent = `${stock.ticker} - ${stock.name}`;
                    tickerSelect.appendChild(option);
                });
            }
        } catch (err) {
            console.error('Failed to load tickers:', err);
            tickerSelect.innerHTML = '<option value="" disabled>Error loading stocks</option>';
        }
    }

    // Load and render comments
    async function loadComments() {
        try {
            const response = await fetch('/api/comments');
            if (response.ok) {
                const data = await response.json();
                renderComments(data.comments || []);
            }
        } catch (err) {
            console.error('Failed to load comments:', err);
        }
    }

    function renderComments(comments) {
        if (comments.length === 0) {
            commentsTableBody.innerHTML = '';
            tableContainer.style.display = 'none';
            noComments.style.display = 'flex';
            return;
        }

        tableContainer.style.display = 'block';
        noComments.style.display = 'none';

        commentsTableBody.innerHTML = comments.map(c => {
            const date = new Date(c.timestamp).toLocaleString(undefined, { 
                year: 'numeric', month: 'short', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            });
            
            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text-primary);">${c.ticker}</td>
                    <td style="color: var(--text-secondary); line-height: 1.5;">${c.comment}</td>
                    <td>
                        <span class="sentiment-badge sentiment-${c.sentiment}">${c.sentiment}</span>
                    </td>
                    <td style="color: var(--text-muted); font-size: 0.85rem;">${date}</td>
                    <td>
                        <button onclick="deleteComment('${c.id}')" style="background: none; border: none; cursor: pointer; color: var(--red-500); padding: 4px; display: flex; align-items: center; justify-content: center;" title="Delete comment">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.deleteComment = async function(id) {
        if (!confirm('Are you sure you want to delete this comment?')) return;
        try {
            const response = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
            if (response.ok) {
                await loadComments();
            } else {
                const data = await response.json();
                alert(`Error: ${data.error || 'Failed to delete comment'}`);
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('Network error while deleting comment.');
        }
    };

    // Handle form submission
    addCommentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const ticker = tickerSelect.value;
        const comment = commentInput.value.trim();
        const sentiment = document.querySelector('input[name="sentiment"]:checked')?.value;
        const submitBtn = document.getElementById('submitBtn');

        if (!ticker || !comment || !sentiment) {
            alert('Please fill out all fields.');
            return;
        }

        // Disable button during submit
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, comment, sentiment })
            });

            if (response.ok) {
                // Reset form
                commentInput.value = '';
                document.querySelectorAll('input[name="sentiment"]').forEach(r => r.checked = false);
                tickerSelect.value = '';
                
                // Reload comments to show the new one
                await loadComments();
            } else {
                const data = await response.json();
                alert(`Error: ${data.error || 'Failed to submit comment'}`);
            }
        } catch (err) {
            console.error('Submit error:', err);
            alert('Network error while submitting comment.');
        } finally {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    });

    // Theme toggle setup
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Init theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // Initial load
    loadTickers();
    loadComments();
});
