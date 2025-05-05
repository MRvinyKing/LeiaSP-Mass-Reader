// script.js

// --- Configuration (Editable in UI) ---
// BROWSER_PROXY_API_URL IS NO LONGER USED FOR LOGIN
let BOOK_API_URL = 'http://localhost:8000'; // Default, will be updated from dialog/localStorage if available
const UPDATE_INTERVAL_SECONDS = 5; // How often to poll progress

// --- DOM Elements ---
// Note: proxyApiUrlInput is removed as the field was removed from HTML
const bookApiUrlInput = document.getElementById('bookApiUrl'); // Inside settings dialog now
const configForm = document.querySelector('.config-section'); // Use a container
const comboListTextArea = document.getElementById('comboList');
const startTasksBtn = document.getElementById('startTasksBtn');
const stopTasksBtn = document.getElementById('stopTasksBtn');
const validationErrorSpan = document.getElementById('validationError');
const progressBody = document.getElementById('progressBody');
const progressSpinner = document.getElementById('progressSpinner');
const logOutput = document.getElementById('logOutput');
const downloadResultsBtn = document.getElementById('downloadResultsBtn');

// Config conditional inputs
const searchTermDiv = document.getElementById('searchTermDiv');
const slugDiv = document.getElementById('slugDiv');
const searchTermInput = document.getElementById('searchTerm');
const bookSlugInput = document.getElementById('bookSlug');
const bookModeRadios = document.querySelectorAll('input[name="bookMode"]');

// Progress Summary Elements
const totalTasksSpan = document.getElementById('total-tasks');
const pendingTasksSpan = document.getElementById('pending-tasks');
const runningTasksSpan = document.getElementById('running-tasks');
const completedTasksSpan = document.getElementById('completed-tasks');
const errorTasksSpan = document.getElementById('error-tasks');

// Header & Dialog Elements
const darkModeToggleBtn = document.getElementById('darkModeToggleBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

// --- Global State ---
let progressPollIntervalId = null;
// Stores state: { refer_id: { status, progresso, ra, password, book_name, message, params (includes targets) } }
let allTasksData = {};
let activeTaskIds = new Set(); // Non-final task IDs for polling
let stopSignal = false; // Flag to stop processing loop


// --- Logging Function ---
function logMessage(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    console[level](`[${timestamp}] ${message}`); // Log to console
    const logEntry = document.createElement('div');
    logEntry.textContent = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    // Simple class for potential future styling
    logEntry.className = `log-${level}`;
    if (level === 'error') logEntry.style.color = 'red';
    if (level === 'warn') logEntry.style.color = 'orange';

    logOutput.appendChild(logEntry);
    logOutput.scrollTop = logOutput.scrollHeight; // Auto-scroll
}

// --- Helper Functions ---
function showValidationError(message) {
    validationErrorSpan.textContent = message;
    logMessage('error', `Validation Error: ${message}`);
}

function clearValidationError() {
    validationErrorSpan.textContent = '';
}

// --- Dark Mode ---
const applyDarkModePreference = () => {
    // Check localStorage first
    let useDark = localStorage.getItem('darkMode') === 'true';
    // Fallback to system preference if no localStorage setting
    if (localStorage.getItem('darkMode') === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        useDark = true;
    }
    document.body.classList.toggle('dark-mode', useDark);
    // Update icon based on mode
    const icon = darkModeToggleBtn.querySelector('i');
    if (icon) {
        // Using adjust might be better than sun/moon if system preference changes dynamically
        // icon.className = useDark ? 'fas fa-sun' : 'fas fa-moon';
        darkModeToggleBtn.title = useDark ? "Alternar Modo Claro" : "Alternar Modo Escuro";
    }
     // Store the resolved preference
     // localStorage.setItem('darkMode', useDark); // Optional: Store even if derived from system initially
};

// --- Settings Dialog ---
function loadSettings() {
     const savedBookApiUrl = localStorage.getItem('bookApiUrl');
     if (savedBookApiUrl) {
          BOOK_API_URL = savedBookApiUrl;
          bookApiUrlInput.value = savedBookApiUrl;
     } else {
         // Use default from script if nothing saved
         bookApiUrlInput.value = BOOK_API_URL;
     }
     // Load other settings here if added later
}

function saveSettings() {
    const newBookApiUrl = bookApiUrlInput.value.trim();
    if (newBookApiUrl) {
         BOOK_API_URL = newBookApiUrl;
         localStorage.setItem('bookApiUrl', newBookApiUrl);
         logMessage('info', `API de Livros atualizada para: ${BOOK_API_URL}`);
    } else {
        logMessage('warn', 'Tentativa de salvar URL da API de Livros vazia.');
        // Optionally revert input to current BOOK_API_URL
        bookApiUrlInput.value = BOOK_API_URL;
    }
    // Save other settings here
}

// --- Validation ---
function validateInputs() {
    clearValidationError();
    let isValid = true;

    // Check config inputs
    const minTime = parseInt(document.getElementById('minTime').value);
    const maxTime = parseInt(document.getElementById('maxTime').value);
    const minPercent = parseInt(document.getElementById('minPercent').value);
    const maxPercent = parseInt(document.getElementById('maxPercent').value);
    const minQuestions = parseInt(document.getElementById('minQuestions').value);
    const maxQuestions = parseInt(document.getElementById('maxQuestions').value);

    if (isNaN(minTime) || isNaN(maxTime) || minTime < 1 || maxTime < minTime) {
        showValidationError('Tempos de leitura inválidos.'); isValid = false;
    } else if (isNaN(minPercent) || isNaN(maxPercent) || minPercent < 0 || maxPercent > 100 || maxPercent < minPercent) {
        showValidationError('Percentuais de leitura inválidos.'); isValid = false;
    } else if (isNaN(minQuestions) || isNaN(maxQuestions) || minQuestions < 0 || maxQuestions < minQuestions) {
        showValidationError('Número de questões inválido.'); isValid = false;
    }

    // Check book mode specific inputs
    const selectedModeRadio = document.querySelector('input[name="bookMode"]:checked');
    if (selectedModeRadio) {
        const selectedModeValue = selectedModeRadio.value;
        if (selectedModeValue === 'pesquisa' && !searchTermInput.value.trim()) {
            showValidationError('Termo de pesquisa é obrigatório.'); isValid = false;
        } else if (selectedModeValue === 'slug' && !bookSlugInput.value.trim()) {
            showValidationError('Slug é obrigatório.'); isValid = false;
        }
    } else {
         showValidationError('Selecione um modo de livro.'); isValid = false;
    }

    // Check combo list
    const comboText = comboListTextArea.value.trim();
    if (!comboText) {
        showValidationError('A lista de contas não pode estar vazia.'); isValid = false;
    } else {
         const lines = comboText.split('\n').map(line => line.trim()).filter(line => line); // Get non-empty lines
         if (lines.length === 0) {
             showValidationError('Nenhuma conta válida (login:senha) encontrada na lista.'); isValid = false;
         } else if (!lines.every(line => line.includes(':'))) {
             showValidationError('Formato inválido na lista de contas. Use login:senha por linha.'); isValid = false;
         }
    }
    // Check API URLs (only Book API URL is critical now)
    if (!BOOK_API_URL.trim()) { // Check the variable, assuming it's updated by settings
         showValidationError('URL da API de Livros não pode estar vazia (verifique Configurações Avançadas).'); isValid = false;
    }

    return isValid;
}

function updateStartButtonState() {
    startTasksBtn.disabled = !validateInputs();
}

function handleBookModeChange() {
    const selectedMode = document.querySelector('input[name="bookMode"]:checked').value;
    searchTermDiv.style.display = selectedMode === 'pesquisa' ? 'block' : 'none';
    slugDiv.style.display = selectedMode === 'slug' ? 'block' : 'none';
    updateStartButtonState();
}

// --- UI Update Functions (Table) ---
function addOrUpdateTaskRow(taskId) {
    const task = allTasksData[taskId];
    if (!task) {
        logMessage('warn', `Tentando atualizar linha para task desconhecida: ${taskId}`);
        return;
    }

    // Destructure data needed for the row
    const {
        ra, password, status = 'desconhecido', book_name, progresso, message, params
    } = task;

    // Derive values needed for display, including the slug
    const targetPercentage = params?.target_read_perc;
    const targetPercentageDisplay = (targetPercentage !== undefined && targetPercentage !== null)? `${targetPercentage}%`: '(Não Definido)';
    const bookSlugValue = params?.target_book_slug || '(Não Definido)';
    const timeTarget = (params?.target_read_time !== undefined) ? `${params.target_read_time} min` : '(Não Definido)';
    const questionsTarget = (params?.target_max_questions !== undefined) ? `${params.target_max_questions} Qs` : '(Não Definido)';
    // Removed target/range variables as they are no longer displayed

    let taskRow = document.querySelector(`.task-row[data-task-id="${taskId}"]`);
    let detailRow = taskRow ? taskRow.nextElementSibling : null;

    // --- Status Mapping --- ( Remains the same as previous version )
    let statusIconClass = 'fas fa-question-circle status-desconhecido';
    let statusTooltip = status.charAt(0).toUpperCase() + status.slice(1);
    switch (status?.toLowerCase()) {
        case 'pendente':
            statusIconClass = 'fas fa-hourglass-start status-pendente'; statusTooltip = 'Pendente'; break;
        case 'iniciando tarefa': case 'login_realizado': case 'livro_selecionado':
            statusIconClass = 'fas fa-spinner fa-spin status-iniciado'; statusTooltip = statusTooltip; break;
        case 'iniciado': case 'processando': case 'lendo': case 'respondendo':
            statusIconClass = 'fas fa-cogs status-processando'; statusTooltip = statusTooltip; break;
        case 'concluido':
            statusIconClass = 'fas fa-check-circle status-concluido'; statusTooltip = 'Concluído'; break;
        case 'erro': case 'falha': case 'nao encontrado':
            statusIconClass = 'fas fa-times-circle status-erro'; statusTooltip = statusTooltip; break;
        case 'cancelado':
            statusIconClass = 'fas fa-ban status-cancelado'; statusTooltip = 'Cancelado'; break;
        case 'inativo':
            statusIconClass = 'fas fa-power-off status-inativo'; statusTooltip = 'Inativo'; break;
    }

    const currentBookName = book_name || '(Aguardando)';
    const currentProgressMsg = progresso || message || 'Pronto';

    if (!taskRow) {
        // Create new rows (main and detail)
        const placeholder = progressBody.querySelector('.placeholder-row');
        if(placeholder) placeholder.remove();

        taskRow = document.createElement('tr');
        taskRow.className = 'task-row';
        taskRow.dataset.taskId = taskId;
        taskRow.dataset.ra = ra || 'N/A';
        taskRow.dataset.password = password || '';
        // Store slug in data attribute as well, might be useful
        taskRow.dataset.bookSlug = bookSlugValue;
        // Removed target/range data attributes as they aren't displayed

        detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.style.display = 'none';

        // --- Adjusted taskRow.innerHTML (Removed Task ID cell) ---
        taskRow.innerHTML = `
            <td class="status-cell" title="${statusTooltip}"><i class="${statusIconClass}"></i></td>
            <td>${ra || 'N/A'}</td>
            <td class="book-name">${currentBookName}</td>
            <td class="progress-message">${currentProgressMsg}</td>
        `;

        // --- Adjusted detailRow.innerHTML (Removed targets, Added Slug, Adjusted colspan) ---
        detailRow.innerHTML = `
            <td colspan="4"> <!-- Colspan is now 4 -->
                <div class="detail-content">
                    <p><strong>ID Tarefa:</strong> <span class="task-id-value">${taskId}</span></p>
                    <p><strong>RA:</strong> <span class="ra-value">${ra || 'N/A'}</span></p>
                    <p><strong>Senha:</strong> <span class="password-value" data-password="${password || ''}">******</span> <button class="toggle-password" title="Mostrar/Ocultar Senha"><i class="fas fa-eye"></i></button></p>
                    <p><strong>Livro (Selecionado):</strong> <span class="book-name-value">${currentBookName}</span></p>
                    <p><strong>Slug:</strong> <span class="book-slug-value">${bookSlugValue}</span></p> <!-- Added Slug -->
                    <hr style="border-top: 1px dashed var(--border-light); margin: 8px 0;">
                    <!-- Target/Range paragraphs removed -->
                    <p><strong>Tempo Leitura (Exec):</strong> <span class="time-target-value">${timeTarget}</span></p>
                    <p><strong>Questões (Exec):</strong> <span class="questions-target-value">${questionsTarget}</span></p>
                    <p><strong>Porcentagem Leitura (Exec):</strong> <span class="target-percentage-value">${targetPercentageDisplay}</span></p>
                </div>
            </td>
        `;

        progressBody.appendChild(taskRow);
        progressBody.appendChild(detailRow);

    } else {
        // Update existing row
        const statusCell = taskRow.querySelector('.status-cell');
        const raCell = taskRow.cells[1]; // RA is now cell index 1
        const bookNameCell = taskRow.querySelector('.book-name');
        const messageCell = taskRow.querySelector('.progress-message');
        const detailContent = detailRow?.querySelector('.detail-content');

        if (statusCell) {
            statusCell.title = statusTooltip;
            statusCell.innerHTML = `<i class="${statusIconClass}"></i>`;
        }
        if (raCell) { // Update RA cell if needed (unlikely but possible)
            raCell.textContent = ra || 'N/A';
        }
        if (bookNameCell) {
            bookNameCell.textContent = currentBookName;
        }
        if (messageCell) {
            messageCell.textContent = currentProgressMsg;
        }

        // --- Update Detail Row Content ---
        if (detailContent) {
            detailContent.querySelector('.task-id-value').textContent = taskId;
            detailContent.querySelector('.ra-value').textContent = ra || 'N/A';
            detailContent.querySelector('.book-name-value').textContent = currentBookName;
            detailContent.querySelector('.book-slug-value').textContent = bookSlugValue; // Update Slug
            detailContent.querySelector('.time-target-value').textContent = timeTarget;
            detailContent.querySelector('.questions-target-value').textContent = questionsTarget;

            // Update password span's data attribute and reset view

            const percentageSpan = detailContent.querySelector('.target-percentage-value');
            if (percentageSpan) {
                 percentageSpan.textContent = targetPercentageDisplay;
            }
            const passSpan = detailContent.querySelector('.password-value');
            const passToggleIcon = detailContent.querySelector('.toggle-password i');
            if(passSpan) {
                 passSpan.dataset.password = password || '';
                 passSpan.textContent = '******';
            }
            if(passToggleIcon) passToggleIcon.className = 'fas fa-eye';

            // Update data attributes on main row if necessary
            taskRow.dataset.ra = ra || 'N/A';
            taskRow.dataset.password = password || '';
            taskRow.dataset.bookSlug = bookSlugValue;
        }
    }
}


function updateSummaryAndPolling() {
    let summary = { total: 0, pending: 0, running: 0, completed: 0, error: 0 };
    const finalStates = ["concluido", "erro", "falha", "cancelado", "inativo", "nao encontrado"]; // Use lower case
    activeTaskIds.clear(); // Recalculate active IDs

    Object.values(allTasksData).forEach(task => {
        const statusLower = (task.status || 'desconhecido').toLowerCase();
        summary.total++;
        if (statusLower === 'concluido') summary.completed++;
        else if (statusLower === 'pendente') summary.pending++;
        else if (finalStates.includes(statusLower)) summary.error++;
        else { // Consider all others as running for polling purposes
             summary.running++;
             // Add to polling if not final and not pending
             activeTaskIds.add(task.refer_id);
        }
    });

     // Update summary display
    totalTasksSpan.textContent = `Total: ${summary.total}`;
    pendingTasksSpan.textContent = `Pendentes: ${summary.pending}`;
    runningTasksSpan.textContent = `Executando: ${summary.running}`;
    completedTasksSpan.textContent = `Concluídas: ${summary.completed}`;
    errorTasksSpan.textContent = `Erros/Falhas: ${summary.error}`;

    // Manage polling interval
    if (activeTaskIds.size > 0 && !progressPollIntervalId && !stopSignal) {
        startProgressPolling();
    } else if (activeTaskIds.size === 0 && progressPollIntervalId) {
        logMessage('info', "Nenhuma tarefa ativa restante. Parando monitoramento.");
        stopProgressPolling();
        if (summary.total > 0) downloadResultsBtn.style.display = 'inline-block'; // Show download button if tasks were processed
    }

    // If no tasks ever started or all finished immediately
    if (summary.total > 0 && activeTaskIds.size === 0 && !progressPollIntervalId) {
         if (summary.total > 0) downloadResultsBtn.style.display = 'inline-block';
    }
}


// --- API Call Functions ---

// V-------------------- MODIFIED LOGIN FUNCTION --------------------V
async function getTokenByLoginJS(login, password, refer_id) {
    updateTaskStatus(refer_id, "iniciado", "Autenticando..."); // Simpler initial message
    logMessage('info', `[${refer_id}] Attempting login for ${login} via ${BOOK_API_URL}/login`);

    const loginUrl = `${BOOK_API_URL}/login`;
    const payload = { login: login, password: password }; // Correct payload structure

    try {
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        logMessage('debug', `[${refer_id}] Login API Response Status: ${response.status}`);

        if (response.ok) { // Status 200-299
            const data = await response.json();
            const token = data.token;

            if (!token) {
                throw new Error("Token não encontrado na resposta de sucesso da API de login.");
            }

            logMessage('info', `[${refer_id}] Token obtido com sucesso.`);
            updateTaskStatus(refer_id, "login_realizado", "Login OK."); // Update status on success
            return token; // Return the final token directly
        }
        // Handle known failure statuses explicitly
        else {
            let errorMessage = `Falha no Login (${response.status})`;
            let errorReason = "UNKNOWN_ERROR";
            try {
                const errorData = await response.json();
                 // Try parsing FastAPI detail format
                if (errorData.detail && typeof errorData.detail === 'object' && errorData.detail.message) {
                    errorMessage = errorData.detail.message;
                    errorReason = errorData.detail.reason || errorReason;
                } else if (errorData.detail && typeof errorData.detail === 'string') {
                    errorMessage = errorData.detail; // Handle cases where detail is just a string
                } else if (errorData.message) { // Handle other common error message formats
                     errorMessage = errorData.message;
                }
                logMessage('warn', `[${refer_id}] Login failed. Reason: ${errorReason} - ${errorMessage}`);
            } catch (e) {
                logMessage('warn', `[${refer_id}] Login failed with status ${response.status}, but couldn't parse error details.`);
                errorMessage = `Falha no Login (${response.status} - ${response.statusText || 'Erro desconhecido'})`;
            }
            throw new Error(errorMessage); // Throw the error to be caught below
        }

    } catch (error) { // Catches fetch errors (network) and errors thrown above
        logMessage('error', `[${refer_id}] Erro durante o login: ${error.message}`);
        updateTaskStatus(refer_id, "erro", `Falha Login: ${error.message.substring(0, 100)}`); // Truncate long messages
        return null; // Indicate failure to the calling function
    }
}
// ^-------------------- END OF MODIFIED LOGIN FUNCTION --------------------^


// --- Generic API Request Helper for Book API ---
async function callBookApi(endpoint, method = 'GET', payload = null, params = null) {
    const url = new URL(`${BOOK_API_URL}${endpoint}`);
    if (params) {
        Object.keys(params).forEach(key => {
            if (Array.isArray(params[key])) {
                params[key].forEach(value => url.searchParams.append(key, value));
            } else {
                url.searchParams.append(key, params[key]);
            }
        });
    }

    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            // Token now usually goes in body for POST requests to this specific API
        },
    };

    if (payload) {
        options.body = JSON.stringify(payload);
    }

    logMessage('debug', `Calling Book API: ${method} ${url.toString()}`);

    try {
        const response = await fetch(url.toString(), options);
        logMessage('debug', `Book API Response Status (${endpoint}): ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            let errorDetail = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                // Extract detailed message if available
                if (errorJson.detail && typeof errorJson.detail === 'object' && errorJson.detail.message) {
                     errorDetail = errorJson.detail.message;
                } else if (errorJson.detail && typeof errorJson.detail === 'string') {
                    errorDetail = errorJson.detail;
                } else if (errorJson.message) {
                     errorDetail = errorJson.message;
                } else {
                    errorDetail = JSON.stringify(errorJson); // Fallback
                }
            } catch(e) {} // Keep original text if JSON parsing fails
            throw new Error(`Book API Error (${response.status} - ${endpoint}): ${errorDetail}`);
        }
        if (response.status === 204) return { success: true }; // No Content

        try {
            return await response.json();
        } catch (jsonError) {
             logMessage('warn', `Book API endpoint ${endpoint} returned OK status (${response.status}) but failed to parse JSON response: ${jsonError.message}`);
             throw new Error(`Book API Error (${response.status} - ${endpoint}): Invalid JSON response.`);
        }
    } catch (error) {
        logMessage('error', `Error calling Book API endpoint ${endpoint}: ${error.message || error}`);
        throw error; // Re-throw
    }
}

// --- Specific Book API Call Wrappers ---
async function callGetRecommendedBooksJS(token) {
    const payload = { token: token };
    const response = await callBookApi("/books/recommended", 'POST', payload);
    return Array.isArray(response) ? response : [];
}

async function callSearchBooksJS(token, term) {
    const payload = { token: token, term: term };
    const response = await callBookApi("/books/search", 'POST', payload);
    return Array.isArray(response) ? response : [];
}

async function callGetIndicatedBooksJS(token) {
    const payload = { token: token };
    const response = await callBookApi("/books/indicated", 'POST', payload);
    return Array.isArray(response) ? response : [];
}

async function callStartReadBookTaskJS(taskParams) {
    // taskParams should include: token, refer_id, book_slug, book_name, read_time, read_perc, max_q
    const payload = {
        token: taskParams.token,
        refer_id: taskParams.refer_id,
        book_slug: taskParams.book_slug,
        book_name: taskParams.book_name,
        read_time_minutes: taskParams.read_time,
        read_percentage: taskParams.read_perc,
        answer_questions: true, // Assuming always true
        max_answered_questions: taskParams.max_q
    };
    return await callBookApi("/start_read_book_task", 'POST', payload);
}

async function callGetProgressJS(referIdsList) {
    if (!referIdsList || referIdsList.length === 0) {
        return {};
    }
    return await callBookApi("/get_progress", 'GET', null, { refer_ids: referIdsList });
}


// --- Task Orchestration ---

function updateTaskStatus(refer_id, status, progresso, book_name = null, message = null) {
     if (!allTasksData[refer_id]) {
          logMessage('warn', `Attempted to update status for unknown task ID: ${refer_id}`);
          return;
     }
     allTasksData[refer_id].status = status;
     allTasksData[refer_id].progresso = progresso; // Main progress/status message shown in table
     if (book_name) allTasksData[refer_id].book_name = book_name;
     if (message && message !== progresso) allTasksData[refer_id].message = message; // Additional detail message

     // Update the specific row in the UI using the new function
     addOrUpdateTaskRow(refer_id);
     // Update summary and check polling status
     updateSummaryAndPolling();
}

async function processSingleUserTask(loginInfo, settings, refer_id) {
     if (stopSignal) {
          logMessage('warn', `[${refer_id}] Stop signal received, skipping task.`);
          updateTaskStatus(refer_id, "cancelado", "Parado pelo usuário antes de iniciar.");
          return;
     }

     const { login, password } = loginInfo;
     logMessage('info', `[${refer_id}] Starting orchestration for ${login}`);

     let finalToken = null;
     let selectedBookInfo = null;
     let bookName = "N/A";
     let bookSlug = null;

     try {
          // 1. Login
          finalToken = await getTokenByLoginJS(login, password, refer_id);
          if (!finalToken) {
              logMessage('error', `[${refer_id}] Login failed. Stopping orchestration for this user.`);
              return; // Error status already set in getTokenByLoginJS
          }
          logMessage('debug', `[${refer_id}] Login successful. Token (start): ${finalToken.substring(0, 10)}...`);

          // 2. Book Selection
          updateTaskStatus(refer_id, "processando", "Selecionando livro via API...");
          let books_list = [];
          let bookSelectionError = null;

          try {
              const mode = settings.book_selection_mode_original; // Use original value ('recomendados', 'indicados', etc.)
              if (mode === "recomendados") {
                  books_list = await callGetRecommendedBooksJS(finalToken);
                  if (!books_list || books_list.length === 0) bookSelectionError = "API: Nenhum livro recomendado encontrado.";
                  else selectedBookInfo = books_list[Math.floor(Math.random() * books_list.length)];
              } else if (mode === "indicados") {
                  books_list = await callGetIndicatedBooksJS(finalToken);
                  if (!books_list || books_list.length === 0) bookSelectionError = "API: Nenhum livro indicado encontrado.";
                  else selectedBookInfo = books_list[Math.floor(Math.random() * books_list.length)];
              } else if (mode === "pesquisa") {
                  if (!settings.search_term) bookSelectionError = "Termo de pesquisa não fornecido.";
                  else {
                      books_list = await callSearchBooksJS(finalToken, settings.search_term);
                      if (!books_list || books_list.length === 0) bookSelectionError = `API: Nenhum livro encontrado para '${settings.search_term}'.`;
                      else selectedBookInfo = books_list[0]; // Use first result
                  }
              } else { // Direct slug mode (slug is stored in settings.book_selection_mode which contains the slug itself)
                  selectedBookInfo = { slug: settings.book_selection_mode_slug };
                  if (!selectedBookInfo.slug) bookSelectionError = "Slug inválido/vazio fornecido.";
              }
          } catch (apiError) {
              throw new Error(`Falha na API de livros (${settings.book_selection_mode_original}): ${apiError.message || apiError}`);
          }

          if (bookSelectionError) throw new Error(bookSelectionError);
          if (!selectedBookInfo || !selectedBookInfo.slug) throw new Error("Falha ao selecionar livro ou obter slug.");

          bookSlug = selectedBookInfo.slug;
          bookName = selectedBookInfo.name || `Livro (Slug: ${bookSlug})`; // Use name if available
          updateTaskStatus(refer_id, "livro_selecionado", `Livro: ${bookName.substring(0, 50)}. Calculando params...`, bookName);
          logMessage('info', `[${refer_id}] Book selected: ${bookName} (${bookSlug})`);

          // 3. Randomize Parameters (Correlated)
          const { minTime, maxTime, minPercent, maxPercent, minQuestions, maxQuestions } = settings;
          const timeCorrelationFactor = 0.3; // 30% correlation window

          const read_perc = Math.floor(Math.random() * (maxPercent - minPercent + 1)) + minPercent;
          const time_range = maxTime - minTime;
          const perc_range = maxPercent - minPercent;
          let relative_perc_position = (perc_range > 0) ? (read_perc - minPercent) / perc_range : 0.5; // Handle div by zero
          const target_time = minTime + relative_perc_position * time_range;
          let read_time = Math.round(target_time);

          // Apply correlation window
          if (time_range > 0 && timeCorrelationFactor > 0) {
              const half_window = (time_range * timeCorrelationFactor) / 2;
              const random_min_bound = Math.max(minTime, target_time - half_window);
              const random_max_bound = Math.min(maxTime, target_time + half_window);
              const final_min_time = Math.ceil(random_min_bound);
              let final_max_time = Math.floor(random_max_bound);
              if (final_max_time < final_min_time) final_max_time = final_min_time; // Ensure range is valid
              read_time = Math.floor(Math.random() * (final_max_time - final_min_time + 1)) + final_min_time;
          }
          read_time = Math.max(minTime, Math.min(maxTime, read_time)); // Clamp to min/max

          const max_q = Math.floor(Math.random() * (maxQuestions - minQuestions + 1)) + minQuestions;

          // Store target parameters in allTasksData for the detail view
          allTasksData[refer_id].params = {
                ...settings, // Include original min/max ranges
                target_read_time: read_time,
                target_read_perc: read_perc,
                target_max_questions: max_q,
                target_book_slug: bookSlug,
                target_book_name: bookName };

          const paramsMsg = `Params: ${read_perc}% / ${read_time}m / ${max_q} Qs.`;
          updateTaskStatus(refer_id, "iniciando_tarefa", `${paramsMsg} Iniciando na API...`, bookName);
          logMessage('info', `[${refer_id}] ${paramsMsg}`);

          if (stopSignal) {
               updateTaskStatus(refer_id, "cancelado", "Parado antes de iniciar tarefa na API.");
               return;
          }

          // 4. Call API to Start Task
          const startParams = {
              token: finalToken, refer_id, book_slug: bookSlug, book_name: bookName, read_time, read_perc, max_q
          };
          const startResponse = await callStartReadBookTaskJS(startParams);

          if (startResponse && startResponse.refer_id === refer_id) {
              logMessage('info', `[${refer_id}] Tarefa iniciada com sucesso na API de Livros.`);
              const apiStatus = startResponse.initial_status;
              // Update with initial status from API if available
              if (typeof apiStatus === 'object' && apiStatus !== null && apiStatus.status) {
                   updateTaskStatus(refer_id, apiStatus.status, apiStatus.progresso || "Tarefa iniciada via API.", bookName, apiStatus.message);
              } else {
                   updateTaskStatus(refer_id, "iniciado", "Tarefa iniciada via API.", bookName);
              }
              // Add to polling set implicitly via updateSummaryAndPolling call below
          } else {
               throw new Error("Falha ao iniciar a tarefa na API (resposta inesperada).");
          }

     } catch (error) {
          logMessage('error', `[${refer_id}] Falha na orquestração: ${error.message}`);
          const currentStatus = allTasksData[refer_id]?.status || "desconhecido";
          const finalStates = ["concluido", "erro", "falha", "cancelado"];
          if (!finalStates.includes(currentStatus.toLowerCase())) {
               updateTaskStatus(refer_id, "erro", `Erro: ${error.message.substring(0, 100)}`, bookName || "N/A");
          }
     } finally {
         updateSummaryAndPolling(); // Ensure summary/polling state is correct after each task attempt
     }
}


// --- Progress Monitoring ---

async function fetchProgress() {
     if (activeTaskIds.size === 0 || stopSignal) {
         if (stopSignal && progressPollIntervalId) stopProgressPolling(); // Stop if signal received
         return;
     }

     logMessage('debug', `Polling for ${activeTaskIds.size} tasks: [${Array.from(activeTaskIds).join(', ')}]`);
     progressSpinner.style.display = 'inline-block';
     const idsToPoll = Array.from(activeTaskIds); // Copy the set

     try {
         const progressUpdate = await callGetProgressJS(idsToPoll);

         if (progressUpdate && typeof progressUpdate === 'object') {
             let updated = false;
             let newlyFinishedCount = 0;
             Object.keys(progressUpdate).forEach(taskId => {
                 if (allTasksData[taskId] && activeTaskIds.has(taskId)) {
                      const newData = progressUpdate[taskId];
                      if (typeof newData === 'object' && newData !== null) {
                          const oldStatus = allTasksData[taskId].status;
                          const newStatus = newData.status || oldStatus; // Fallback to old status
                          const newProgresso = newData.progresso || allTasksData[taskId].progresso; // Fallback
                          const newBookName = newData.book_name || allTasksData[taskId].book_name; // Fallback
                          const newMessage = newData.message || allTasksData[taskId].message; // Fallback

                          // Check if relevant data changed
                          if(oldStatus !== newStatus || allTasksData[taskId].progresso !== newProgresso || allTasksData[taskId].book_name !== newBookName || allTasksData[taskId].message !== newMessage ) {
                              updateTaskStatus(taskId, newStatus, newProgresso, newBookName, newMessage);
                              updated = true;
                          }

                          const finalStates = ["concluido", "erro", "falha", "cancelado", "inativo", "nao encontrado"];
                          const newStatusLower = newStatus.toLowerCase();
                          if (finalStates.includes(newStatusLower)) {
                              if (!finalStates.includes(oldStatus.toLowerCase())) { // Check if it *just* became final
                                   newlyFinishedCount++;
                              }
                              activeTaskIds.delete(taskId); // Remove from polling
                          }
                      } else {
                          logMessage('warn', `Received invalid progress data object for task ${taskId}`);
                           activeTaskIds.delete(taskId); // Assume it's failed or finished if API returns bad data
                      }
                 } else if (activeTaskIds.has(taskId)) {
                      logMessage('warn', `Received progress for unknown/inactive task ID from API: ${taskId}`);
                      activeTaskIds.delete(taskId); // Remove invalid ID
                 }
             });

             if (updated) {
                 logMessage('debug', `Progress updated. ${newlyFinishedCount} tasks reached final state this cycle.`);
             } else if (activeTaskIds.size > 0) {
                  logMessage('debug', `No status changes detected for active tasks.`);
             }
             // No need to call updateSummaryAndPolling here, as updateTaskStatus already does
         } else {
             logMessage('warn', "Monitor: Falha ao obter atualização de progresso ou resposta vazia.");
         }

     } catch (error) {
         logMessage('error', `Monitor: Erro ao buscar progresso: ${error.message}`);
         // Consider stopping polling on repeated errors? For now, it will retry.
     } finally {
          // Update summary and check polling *after* processing updates and removing finished tasks
          updateSummaryAndPolling();
          progressSpinner.style.display = activeTaskIds.size > 0 ? 'inline-block' : 'none';
     }
}

function startProgressPolling() {
    if (progressPollIntervalId) return; // Already polling
    if (activeTaskIds.size > 0 && !stopSignal) {
        logMessage('info', `Iniciando monitoramento de progresso para ${activeTaskIds.size} tarefas...`);
        progressSpinner.style.display = 'inline-block';
        stopTasksBtn.style.display = 'inline-block';
        downloadResultsBtn.style.display = 'none';
        fetchProgress(); // Fetch immediately
        progressPollIntervalId = setInterval(fetchProgress, UPDATE_INTERVAL_SECONDS * 1000);
    } else {
         logMessage('info', "Nenhuma tarefa ativa para iniciar monitoramento.");
         stopTasksBtn.style.display = 'none';
         progressSpinner.style.display = 'none';
         if (Object.keys(allTasksData).length > 0) {
              downloadResultsBtn.style.display = 'inline-block';
         }
    }
}

function stopProgressPolling(stoppedByUser = false) {
    if (progressPollIntervalId) {
        clearInterval(progressPollIntervalId);
        progressPollIntervalId = null;
        logMessage('info', `Monitoramento de progresso parado${stoppedByUser ? ' pelo usuário' : ''}.`);
    }
    // Always ensure buttons/spinner reflect stopped state
    progressSpinner.style.display = 'none';
    stopTasksBtn.style.display = 'none';
    if (Object.keys(allTasksData).length > 0) {
         downloadResultsBtn.style.display = 'inline-block';
    }
}


// --- Event Listeners ---

// Update button state when config or combo changes
configForm.addEventListener('input', updateStartButtonState);
comboListTextArea.addEventListener('input', updateStartButtonState);
bookModeRadios.forEach(radio => radio.addEventListener('change', handleBookModeChange));
// bookApiUrlInput listener is handled within the dialog logic

// Handle Start Tasks button click
startTasksBtn.addEventListener('click', async () => {
    // Re-validate one last time before starting
    if (!validateInputs()) return;

    // BOOK_API_URL should be up-to-date from settings load/save
    if (!BOOK_API_URL) {
        showValidationError("URL da API de Livros não definida. Verifique as Configurações Avançadas.");
        return;
    }

    clearValidationError();
    startTasksBtn.disabled = true;
    startTasksBtn.textContent = 'Iniciando...';
    // Use new placeholder structure
    progressBody.innerHTML = `<tr class="placeholder-row"><td colspan="5">Iniciando tarefas... Limpando tabela anterior.</td></tr>`;
    logOutput.innerHTML = ''; // Clear log
    allTasksData = {}; // Reset state
    activeTaskIds.clear();
    stopSignal = false; // Reset stop signal
    stopProgressPolling(); // Ensure any previous polling is stopped
    downloadResultsBtn.style.display = 'none';

    // Gather settings
    const selectedModeValue = document.querySelector('input[name="bookMode"]:checked').value;
    const settings = {
        book_selection_mode_original: selectedModeValue, // Keep the original mode name
        book_selection_mode_slug: null, // Store slug separately if needed
        search_term: null, // Reset search term
        minTime: parseInt(document.getElementById('minTime').value),
        maxTime: parseInt(document.getElementById('maxTime').value),
        minPercent: parseInt(document.getElementById('minPercent').value),
        maxPercent: parseInt(document.getElementById('maxPercent').value),
        minQuestions: parseInt(document.getElementById('minQuestions').value),
        maxQuestions: parseInt(document.getElementById('maxQuestions').value),
    };
    if (selectedModeValue === 'slug') {
         settings.book_selection_mode_slug = bookSlugInput.value.trim();
    } else if (selectedModeValue === 'pesquisa') {
        settings.search_term = searchTermInput.value.trim() || null;
    }

    // Prepare combo list
    const comboListRaw = comboListTextArea.value.trim().split('\n');
    const loginsInfo = [];
    for (const line of comboListRaw) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes(':')) {
            const [login, ...passwordParts] = trimmedLine.split(':');
            const password = passwordParts.join(':').trim();
            if(login.trim() && password) { // Ensure both parts exist
                 loginsInfo.push({ login: login.trim(), password: password });
            }
        }
    }

    if (loginsInfo.length === 0) {
        showValidationError("Nenhuma conta válida (login:senha) encontrada na lista.");
        startTasksBtn.textContent = 'Iniciar Tarefas';
        updateStartButtonState(); // Re-enable based on validation
        progressBody.innerHTML = `<tr class="placeholder-row"><td colspan="5">Falha ao iniciar: Nenhuma conta válida.</td></tr>`; // Update placeholder
        return;
    }

    logMessage('info', `Iniciando orquestração para ${loginsInfo.length} contas.`);

    // Initialize all task data first
    loginsInfo.forEach((loginInfo, i) => {
        const ra_part = loginInfo.login.split('@')[0] || 'user';
        const timestamp = Date.now();
        const refer_id = `task_${ra_part}_${timestamp}_${i}`;

        // Initialize with necessary data for the detail row eventually
        allTasksData[refer_id] = {
            refer_id: refer_id,
            ra: loginInfo.login,
            password: loginInfo.password, // Store password here for detail view
            status: "pendente",
            progresso: "Na fila...",
            book_name: "N/A",
            params: settings, // Store base settings initially
            message: null
        };
        addOrUpdateTaskRow(refer_id); // Add pending row to UI using the new function
    });
    updateSummaryAndPolling(); // Update counts for pending tasks

    // Process tasks sequentially using await within the loop
    const taskIdsToProcess = Object.keys(allTasksData);
    for (const taskId of taskIdsToProcess) {
        if (stopSignal) {
             logMessage('warn', `Processamento parado pelo usuário. Tarefas restantes não serão iniciadas.`);
             // Update remaining pending tasks to 'cancelado' status
             Object.keys(allTasksData).forEach(tid => {
                if (allTasksData[tid].status === 'pendente') {
                    updateTaskStatus(tid, 'cancelado', 'Parado pelo usuário.');
                }
             });
             break; // Exit the loop
        }
        const taskData = allTasksData[taskId];
        // Pass loginInfo and settings specifically needed by processSingleUserTask
        await processSingleUserTask(
             { login: taskData.ra, password: taskData.password }, // Reconstruct loginInfo
             settings, // Pass combined settings
             taskId
        );
        // Optional delay: await new Promise(res => setTimeout(res, 100));
    }

    logMessage('info', "Fase de inicialização/processamento sequencial de tarefas concluída.");
    startTasksBtn.textContent = 'Iniciar Tarefas'; // Reset button text
    updateStartButtonState(); // Re-enable button if validation passes

    // Final check on polling state
    updateSummaryAndPolling();
    if (activeTaskIds.size === 0) {
         stopProgressPolling(); // Ensure buttons/spinner are correct
         logMessage('info', stopSignal ? "Processamento parado." : "Todas as tarefas concluídas ou falharam na inicialização.");
    } else if (!stopSignal) {
        // Polling should have been started by updateSummaryAndPolling if needed
    }

});

// Handle Stop button click
stopTasksBtn.addEventListener('click', () => {
     logMessage('warn', "Botão PARAR pressionado. Novas tarefas não serão iniciadas e o monitoramento será interrompido.");
     stopSignal = true;
     stopProgressPolling(true); // Pass true to indicate stopped by user
     // Update status of tasks that were running or pending
     Object.keys(allTasksData).forEach(taskId => {
          const statusLower = allTasksData[taskId].status.toLowerCase();
          const finalStates = ["concluido", "erro", "falha", "cancelado"];
          if (!finalStates.includes(statusLower)) {
               updateTaskStatus(taskId, 'cancelado', 'Parado pelo usuário');
          }
     });
     // Ensure summary is updated after changing statuses
     updateSummaryAndPolling();
});

// Handle Download Results button click
downloadResultsBtn.addEventListener('click', () => {
     if (Object.keys(allTasksData).length === 0) {
          alert("Nenhum resultado para baixar.");
          return;
     }

     let fileContent = `Resultados da Execução (Frontend) - ${new Date().toLocaleString('pt-BR')}\n`;
     fileContent += `API Tarefas Livros: ${BOOK_API_URL}\n`; // Use the current variable value
     fileContent += "==================================================\n\n";

     const sortedTaskIds = Object.keys(allTasksData).sort();

     sortedTaskIds.forEach(taskId => {
          const task = allTasksData[taskId];
          const status = task.status || "desconhecido";
          const message = task.progresso || task.message || "N/A"; // Use progresso as primary message
          const ra = task.ra || "N/A";
          const book = task.book_name || "N/A";
          const password = task.password || "N/A"; // Include password in download

          fileContent += `ID Tarefa: ${taskId}\n`;
          fileContent += `  RA: ${ra}\n`;
          // Include password in download (user explicitly requested download)
          fileContent += `  Senha: ${password}\n`;
          fileContent += `  Livro Selecionado: ${book}\n`;
          fileContent += `  Status Final: ${status.toUpperCase()}\n`;
          fileContent += `  Mensagem/Progresso: ${message}\n`;
          // Include target parameters from task.params if available
          if(task.params) {
                fileContent += `  --- Targets ---\n`;
                fileContent += `  Livro Target: ${task.params.target_book_name || task.params.target_book_slug || '(Não Definido)'}\n`;
                fileContent += `  Range Tempo: ${task.params.minTime}-${task.params.maxTime} min\n`;
                fileContent += `  Range Perguntas: ${task.params.minQuestions}-${task.params.maxQuestions} Qs\n`;
                fileContent += `  Tempo Exec: ${task.params.target_read_time !== undefined ? task.params.target_read_time + ' min' : '(Não Definido)'}\n`;
                fileContent += `  Perguntas Exec: ${task.params.target_max_questions !== undefined ? task.params.target_max_questions + ' Qs' : '(Não Definido)'}\n`;
                fileContent += `  Leitura Exec: ${task.params.target_read_perc !== undefined ? task.params.target_read_perc + '%' : '(Não Definido)'}\n`;
          }
          fileContent += "--------------------------------------------------\n";
     });

     const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
     a.download = `leitura_resultados_${timestamp}.txt`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
     logMessage('info', "Arquivo de resultados gerado para download.");
});

// Listener for Dark Mode Toggle
darkModeToggleBtn.addEventListener('click', () => {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    applyDarkModePreference(); // Update icon/title
});

// Listeners for Settings Dialog
if (settingsBtn && settingsDialog && closeSettingsBtn) {
    settingsBtn.addEventListener('click', () => {
        loadSettings(); // Load current settings into dialog when opening
        settingsDialog.showModal();
    });

    closeSettingsBtn.addEventListener('click', () => {
        saveSettings(); // Save settings when closing via button
        settingsDialog.close();
        updateStartButtonState(); // Re-validate in case API URL changed
    });

    // Close dialog on backdrop click and Save
    settingsDialog.addEventListener('click', (event) => {
        if (event.target === settingsDialog) {
            saveSettings(); // Save settings when closing via backdrop
            settingsDialog.close();
             updateStartButtonState(); // Re-validate
        }
    });

    // Optional: Save on Enter key in input field
    bookApiUrlInput.addEventListener('keypress', (event) => {
         if (event.key === 'Enter') {
             event.preventDefault(); // Prevent form submission
             saveSettings();
             settingsDialog.close();
             updateStartButtonState();
         }
    });

} else {
    console.error("Settings dialog elements not found.");
    logMessage('error', "Erro: Elementos do diálogo de configurações não encontrados.");
}

// Listener for Row Expansion and Password Toggle (Delegated)
if (progressBody) {
    progressBody.addEventListener('click', (event) => {
        const target = event.target;

        // --- Row Expansion ---
        const taskRow = target.closest('.task-row');
        // Check if the click is on the row itself or its direct children (<td>), but NOT on a button inside
        if (taskRow && target.closest('td') && !target.closest('button')) {
            const detailRow = taskRow.nextElementSibling;
            if (detailRow && detailRow.classList.contains('detail-row')) {
                const isVisible = detailRow.style.display !== 'none';
                detailRow.style.display = isVisible ? 'none' : 'table-row'; // Use table-row for correct rendering
                taskRow.classList.toggle('expanded', !isVisible);
            }
        }

        // --- Password Toggle ---
        const passwordToggleBtn = target.closest('.toggle-password');
        if (passwordToggleBtn) {
            const passwordSpan = passwordToggleBtn.previousElementSibling;
            const icon = passwordToggleBtn.querySelector('i');
            if (passwordSpan && passwordSpan.classList.contains('password-value') && icon) {
                const actualPassword = passwordSpan.dataset.password;
                if (passwordSpan.textContent === '******') {
                    passwordSpan.textContent = actualPassword;
                    icon.className = 'fas fa-eye-slash';
                } else {
                    passwordSpan.textContent = '******';
                    icon.className = 'fas fa-eye';
                }
            }
        }
    });
} else {
    console.error("Progress table body not found.");
    logMessage('error', "Erro: Corpo da tabela de progresso não encontrado.");
}


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings(); // Load API URL from storage
    applyDarkModePreference(); // Apply dark/light mode
    logMessage('info',"Interface carregada. Preencha as configurações e a lista de contas.");
    handleBookModeChange(); // Set initial visibility of conditional inputs
    updateStartButtonState(); // Set initial button state
    // Use new placeholder structure
    progressBody.innerHTML = `<tr class="placeholder-row"><td colspan="5">Pronto para iniciar.</td></tr>`;
    updateSummaryAndPolling(); // Initialize summary counts to zero

     // Optional: Listen for system dark mode changes
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    try {
        darkModeMediaQuery.addEventListener('change', applyDarkModePreference);
    } catch (e1) {
        try {
            // Older browser syntax
            darkModeMediaQuery.addListener(applyDarkModePreference);
        } catch (e2) {
            console.error('Browser does not support dynamic dark mode media query changes.');
        }
    }
});