import utils from './utils.js';

const BASMALLA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
// Added ayah marker start '﴿' to the list for easier checking
const QURAN_SYMBOLS = ["۞", "﴾", "﴿", "۩", 'ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', ' ۛ', 'ۜ', 'ۛ ']
let PROPERTIES_OF_SURAHS = null
const TARGET_CPM = 400;

// --- Constants for Segment Types ---
const SEGMENT_TYPE = {
    SURAH: 'surah',
    JUZ: 'juz',
    HIZB: 'hizb',
    RUB: 'rub',
    PAGE: 'page',
    SEARCH: 'search'
};

// --- Constants for Segment Counts ---
const COUNT = {
    JUZ: 30,
    HIZB: 60,
    RUB: 240,
    PAGE: 604
};

// --- UI State ---
// Определяем предпочтения пользователя ИЛИ сохраненное значение
const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedMode = localStorage.getItem('darkMode');
let isDarkMode = savedMode === 'enabled' || (savedMode === null && prefersDarkMode);
let isHideAyahsButtonActive = false
let currentSearchQuery = null; // Initialize to null to ensure first load happens

// --- Typing State ---
let currentLetterIndex = 0 // Tracks letter index within a word (might be less relevant with word comparison)
let mainQuranWordIndex = 0 // Index for the main container (with symbols)
let noTashkeelWordIndex = 0 // Index for the hidden no-tashkeel container

// --- Ayah Repetition State ---
let ayahRepeatCount = 1; // How many times to repeat the current ayah (renamed for clarity)
let currentAyahRepetition = 1; // Which repetition we are currently on for the current ayah
let currentAyahStartIndex_Main = 0; // Start index of the current ayah in the main container
let currentAyahStartIndex_NoTashkeel = 0; // Start index of the current ayah in the no-tashkeel container

// --- Word Repetition State ---
let wordRepeatCount = 1; // How many times to repeat the current word
let currentWordRepetition = 1; // Which repetition we are currently on for the current word

// --- Error Tracking ---
let totalErrors = 0; // Cumulative errors for the current Surah/Ayah segment

// --- Timer State ---
let timerInterval = null; // Stores the interval ID for the timer
let startTime = null;  // Stores the timestamp when the timer started
let endTime = null; // Stores the timestamp when the timer stopped
let timerDisplayElement = null; // Cache timer display element

// --- Auto-Scroll Detection State ---
let originalTopOffset = 0 // Top offset of the first line
let secondRowTopOffset = 0 // Top offset of the second line (once it appears)
let refWord = null // Reference word span used for hiding previous lines

// --- Ranking & Selection State ---
let currentMode = 'normal'; // 'normal' or 'blind'
let currentSelectionType = SEGMENT_TYPE.SURAH; // 'surah', 'juz', 'hizb', 'rub', 'page', 'search'
let currentSelectionId = null; // ID текущего сегмента (номер суры, джуза и т.д.)
const RESULTS_STORAGE_KEY = 'quranTypePlusResults';
let totalCharsInSegment = 0;
let acpmDisplay = null;
let scoreDisplay = null;
let rankDisplay = null;

// --- DOM Element References (Cache frequently used elements) ---
let quranContainer = null;
let noTashkeelContainer = null;
let inputElement = null;
let errorCountDisplay = null;
let repeatCountInput = null;
let wordRepeatCountInput = null;
let surahSelectionSection = null;
let mainTypingSection = null;
let surahSelectionTBody = null;
let changeSurahButton = null;
let hideAyahsButton = null;
// ДОБАВЛЕНО: Ссылки на tbody для новых таблиц
let juzSelectionTBody = null;
let hizbSelectionTBody = null;
let rubSelectionTBody = null;
let pageSelectionTBody = null;
// ДОБАВЛЕНО: Ссылки на контейнеры вкладок и сами вкладки
let tabLinks = null;
let tabContentContainers = null;

// --- Initialization Functions ---

/**
 * Caches frequently accessed DOM elements.
 */
function cacheDOMElements() {
    quranContainer = document.getElementById("Quran-container");
    noTashkeelContainer = document.getElementById("noTashkeelContainer");
    inputElement = document.getElementById("inputField");
    errorCountDisplay = document.getElementById("errorCountDisplay"); // Cache error display
    repeatCountInput = document.getElementById('repeatCountInput');
    wordRepeatCountInput = document.getElementById('wordRepeatCountInput'); // Cache word repeat input
    timerDisplayElement = document.getElementById("timerDisplay");
    surahSelectionSection = document.getElementById('surah-selection-section');
    mainTypingSection = document.getElementById('main-typing-section');
    changeSurahButton = document.getElementById('change-surah-button');
    hideAyahsButton = document.getElementById('hideAyahsButton');
    acpmDisplay = document.getElementById("acpmDisplay");
    scoreDisplay = document.getElementById("scoreDisplay");
    rankDisplay = document.getElementById("rankDisplay");

    // ДОБАВЛЕНО: Кэширование tbody для всех таблиц
    surahSelectionTBody = document.getElementById('surah-selection-tbody');
    juzSelectionTBody = document.getElementById('juz-selection-tbody');
    hizbSelectionTBody = document.getElementById('hizb-selection-tbody');
    rubSelectionTBody = document.getElementById('rub-selection-tbody');
    pageSelectionTBody = document.getElementById('page-selection-tbody');

    // ДОБАВЛЕНО: Кэширование элементов вкладок
    tabLinks = document.querySelectorAll('.tabs li[data-tab]');
    tabContentContainers = document.querySelectorAll('.tab-content');
}

/**
 * Fetches properties of all Surahs (like names, bismillah presence) from the API.
 */
async function setupSurahData() {
    const baseApiUrl = 'https://api.quran.com/api/v4';
    const url = `${baseApiUrl}/chapters`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch surah data');
        }
        PROPERTIES_OF_SURAHS = await response.json();
    } catch (error) {
        console.error('Error fetching surah data:', error);
        // Potentially show error to user
    }
}

// ИЗМЕНЕНО: Создаем общую функцию для загрузки сегментов
/**
 * Fetches and displays a specific Quran segment (Surah, Juz, Hizb, etc.).
 * Resets state variables for the new segment.
 * @param {string} type - The type of segment (use SEGMENT_TYPE constants).
 * @param {number} id - The number of the segment (Surah number, Juz number, etc.).
 * @param {string} script - The Quran script to use (e.g., 'uthmani').
 */
async function getQuranSegment(type, id, script) {
    // --- Reset State for New Segment ---
    resetTimer();
    currentLetterIndex = 0;
    mainQuranWordIndex = 0;
    noTashkeelWordIndex = 0;

    currentAyahRepetition = 1; // Reset ayah repetition count
    currentWordRepetition = 1; // Reset word repetition count

    currentAyahStartIndex_Main = 0;
    currentAyahStartIndex_NoTashkeel = 0;

    totalErrors = 0; // Reset error count
    updateErrorDisplay(); // Update the display to show 0 errors

    totalCharsInSegment = 0;
    resetResultsDisplay();

    originalTopOffset = 0;
    secondRowTopOffset = 0;
    refWord = null;

    inputElement.value = ""; // Clear input field
    inputElement.classList.remove('incorrectWord'); // Ensure input isn't styled incorrectly initially
    inputElement.disabled = false; // Ensure input is enabled

    // Reset hide words state visually if needed (e.g., button text)
    // if (isHideAyahsButtonActive) { handleHideAyahsButton(); } // Toggle off if desired

    // Сохраняем тип и ID текущего выбора
    currentSelectionType = type;
    currentSelectionId = id;

    // Constructing the API URL based on type
    const baseApiUrl = 'https://api.quran.com/api/v4';
    let url = `${baseApiUrl}/quran/verses/${script}?`;
    let segmentName = ''; // Для отображения информации о сегменте

    switch (type) {
        case SEGMENT_TYPE.SURAH:
            // Добавляем обработку случая, когда ID содержит ':' (для поиска)
            let surahNum = id, startAyah = 1;
            if (typeof id === 'string' && id.includes(':')) {
                const parts = id.split(':');
                surahNum = parseInt(parts[0], 10);
                startAyah = parseInt(parts[1], 10) || 1;
                // Обновляем currentSelectionId, если он был строкой
                currentSelectionId = surahNum; // Для сохранения результатов используем только номер суры
            } else {
                 surahNum = parseInt(id, 10);
            }
            url += `chapter_number=${surahNum}`;
            // Получаем имя суры позже, после загрузки данных
            break;
        case SEGMENT_TYPE.JUZ:
            url += `juz_number=${id}`;
            segmentName = `Juz ${utils.convertToArabicNumber(id)}`;
            break;
        case SEGMENT_TYPE.HIZB:
            url += `hizb_number=${id}`;
            segmentName = `Hizb ${utils.convertToArabicNumber(id)}`;
            break;
        case SEGMENT_TYPE.RUB:
            url += `rub_el_hizb_number=${id}`;
            segmentName = `Rub' ${utils.convertToArabicNumber(id)}`;
            break;
        case SEGMENT_TYPE.PAGE:
            url += `page_number=${id}`;
            segmentName = `Page ${utils.convertToArabicNumber(id)}`;
            break;
        default:
            showToast("Invalid selection type.");
            return;
    }

    // Show loading indicator (optional)
    // showLoadingIndicator(true);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Попытка получить тело ошибки
            throw new Error(`Failed to fetch verses for ${type} ${id}. Status: ${response.status}. ${errorData.message || ''}`);
        }
        const data = await response.json();

        // --- Обработка старта не с первого аята для Сур ---
        let effectiveStartAyah = 1;
        let displayData = data;
        let chapterInfo = null;

        if (type === SEGMENT_TYPE.SURAH || currentSelectionType === SEGMENT_TYPE.SEARCH) {
            let surahNumToUse = currentSelectionId; // Используем сохраненный номер суры
            chapterInfo = PROPERTIES_OF_SURAHS?.chapters?.[surahNumToUse - 1];

             // Обрабатываем случай, когда ID содержал номер аята
            if (typeof id === 'string' && id.includes(':')) {
                 const parts = id.split(':');
                 effectiveStartAyah = parseInt(parts[1], 10) || 1;
             } else {
                 effectiveStartAyah = 1; // По умолчанию для суры, если не указан аят
             }

            const totalAyahs = data.verses.length;
             // Validate startAyah only for Surah type fetched by chapter_number
             if (effectiveStartAyah < 1) {
                 effectiveStartAyah = 1;
             } else if (effectiveStartAyah > totalAyahs) {
                 const surahName = chapterInfo?.name_simple || `Surah ${surahNumToUse}`;
                 showToast(`${surahName} only contains ${utils.convertToArabicNumber(totalAyahs)} ayahs. Starting from Ayah ${utils.convertToArabicNumber(1)}.`);
                 effectiveStartAyah = 1;
             }
            // Обрезаем данные для суры, если нужно начать не с 1 аята
             displayData = processData(data, effectiveStartAyah, script);
        } else {
            // Для Juz, Hizb и т.д. API уже возвращает нужный сегмент, startAyah не нужен
            effectiveStartAyah = 1; // Считаем, что для этих сегментов всегда начинаем с "первого" аята сегмента
            // Определяем информацию о главе из первого аята полученных данных (для басмалы)
            const firstVerseKey = data.verses[0]?.verse_key;
            if (firstVerseKey) {
                const firstVerseParts = firstVerseKey.split(':');
                const chapterNumberOfFirstVerse = parseInt(firstVerseParts[0], 10);
                const ayahNumberOfFirstVerse = parseInt(firstVerseParts[1], 10);
                 chapterInfo = PROPERTIES_OF_SURAHS?.chapters?.[chapterNumberOfFirstVerse - 1];
                 // Показываем басмалу только если сегмент начинается с 1-го аята суры (кроме 9-й)
                 if (ayahNumberOfFirstVerse !== 1 || chapterNumberOfFirstVerse === 9 || chapterNumberOfFirstVerse === 1) {
                     chapterInfo = { ...chapterInfo, bismillah_pre: false }; // Переопределяем для случая не первого аята
                 }
            }
        }


        applyModeSettings(); // Применяем настройки режима (например, скрыть кнопку)
        // Передаем displayData, effectiveStartAyah и segmentName/chapterInfo
        displaySegmentFromJson(displayData, effectiveStartAyah, script, type, chapterInfo, segmentName);

    } catch (error) {
        console.error('Error fetching verses:', error);
        showToast(`Error fetching data for ${type} ${id}. Please try again.`);
        inputElement.disabled = true;
    } finally {
        console.log(currentMode);
        applyModeSettings();
        if (inputElement && !mainTypingSection.classList.contains('is-hidden')) {
            inputElement.disabled = false;
            inputElement.focus();
        }
    }
}

/**
 * Applies UI settings based on the current mode (currentMode).
 * Primarily hides/shows the "Hide Ayahs" button.
 */
function applyModeSettings() {
    if (!hideAyahsButton) return; // Ensure button exists

    if (currentMode === 'blind') {
        hideAyahsButton.style.display = 'none'; // Hide in blind mode
        // Ensure text is NOT hidden if switching to blind mode
        // after activating Hide in normal mode
        if (!isHideAyahsButtonActive) {
            handleHideAyahsButton(); // "Click" button to hide ayahs
        }
    } else { // currentMode === 'normal' or 'search'
        hideAyahsButton.style.display = ''; // Show in normal/search mode
        // Button state (pressed/not pressed) is maintained by isHideAyahsButtonActive
        // and applied by applyHideAyahsVisibility if needed
    }
}

// --- Data Processing and Display ---

/**
 * Processes the raw ayah text (e.g., handling iqlab).
 * @param {string} text - The raw ayah text.
 * @returns {string} The processed ayah text.
 */
function processAyah(text) {
    let ayah = text;
    // Handle iqlab if necessary for comparison logic (may not be needed depending on removeTashkeel)
    ayah = ayah.replace(/\u064B\u06E2/g, '\u064E\u06E2');
    ayah = ayah.replace(/\u064C\u06E2/g, '\u064F\u06E2');
    ayah = ayah.replace(/\u064D\u06ED/g, '\u0650\u06ED');
    return ayah;
}

/**
 * Prepares the verse data: trims whitespace, slices based on startAyah (only for Surah type).
 * @param {object} data - The raw API response data.
 * @param {number} startAyah - The ayah number to start from (relevant for Surah).
 * @param {string} script - The script type.
 * @returns {object} The processed data object (potentially sliced).
 */
function processData(data, startAyah, script) {
    // Trim initial space if present
    const textProp = `text_${script}`;
    if (data.verses.length > 0 && data.verses[0][textProp]?.startsWith(' ')) {
        data.verses[0][textProp] = data.verses[0][textProp].trim();
    }
    // Slice only if startAyah > 1 (relevant for Surah type)
    if (startAyah > 1) {
       // Create a deep copy to avoid modifying the original data if it's cached elsewhere
       const slicedData = JSON.parse(JSON.stringify(data));
       slicedData.verses = slicedData.verses.slice(startAyah - 1);
       return slicedData;
    }
    return data; // Return original data if starting from Ayah 1
}


// ИЗМЕНЕНО: Обобщенная функция отображения
/**
 * Displays the fetched segment content and sets up related elements.
 * @param {object} data - The processed API response data for the segment.
 * @param {number} startAyah - The effective starting ayah number within the segment/surah.
 * @param {string} script - The script type.
 * @param {string} type - The type of segment displayed (SEGMENT_TYPE).
 * @param {object | null} chapterInfo - Info about the Surah (relevant for name/basmallah).
 * @param {string} segmentName - Name of the segment (e.g., "Juz 1").
 */
function displaySegmentFromJson(data, startAyah, script, type, chapterInfo, segmentName) {
    const surahNameEl = document.getElementById("Surah-name");
    const basmallahContainer = document.getElementById("Basmallah");

    const noTashkeelAyahs = [];
    let firstVerseActualNumber = -1; // Для определения первого аята в сегменте

    const surahContent = data.verses.map((ayah, i) => {
        const verseKeyParts = ayah.verse_key.split(':');
        const currentAyahNumberInSurah = parseInt(verseKeyParts[1], 10);
        if (i === 0) {
             firstVerseActualNumber = currentAyahNumberInSurah;
        }
        const arabicNumber = utils.convertToArabicNumber(currentAyahNumberInSurah);
        const processedAyah = processAyah(ayah[`text_${script}`]);
        noTashkeelAyahs.push(processedAyah);
        return `${processedAyah} ﴿${arabicNumber}﴾`;
    }).join(" ");

    // Set Surah Name/Segment Name
    if (type === SEGMENT_TYPE.SURAH || type === SEGMENT_TYPE.SEARCH) {
         surahNameEl.textContent = chapterInfo ? `سورة ${chapterInfo.name_arabic}` : '';
    } else {
         surahNameEl.textContent = segmentName || ''; // Отображаем имя джуза, хизба и т.д.
    }

    // Set Basmallah
    // Показываем басмалу, если:
    // 1. Это Сура (или поиск) И начинается с 1 аята И есть флаг bismillah_pre
    // 2. Это НЕ Сура (Джуз, Хизб и т.д.) И сегмент начинается с 1 аята суры (проверено в getQuranSegment) И есть флаг bismillah_pre
     if (chapterInfo?.bismillah_pre && ( (type === SEGMENT_TYPE.SURAH || type === SEGMENT_TYPE.SEARCH) && startAyah === 1 || (type !== SEGMENT_TYPE.SURAH && type !== SEGMENT_TYPE.SEARCH && firstVerseActualNumber === 1) ) )
     {
         basmallahContainer.textContent = BASMALLA;
     } else {
        basmallahContainer.textContent = "";
    }

    // Ensure fonts are ready before filling containers and calculating offsets
    document.fonts.ready.then(() => {
        fillContainerWithSpans(surahContent, quranContainer);

        const noTashkeelString = utils.createNoTashkeelString(noTashkeelAyahs);
        utils.fillContainer(noTashkeelString, noTashkeelContainer);

        // Calculate total characters for CPM
        totalCharsInSegment = noTashkeelString.replace(/\s/g, '').length;

        // Calculate initial scroll offsets
        originalTopOffset = utils.getOriginalTopOffset(quranContainer);
        secondRowTopOffset = 0;
        refWord = null;

        const wordSpans = quranContainer.querySelectorAll('span');
        if (wordSpans.length > 0) {
            refWord = wordSpans[0]; // Initialize refWord to the first word
            for (let i = 1; i < wordSpans.length; i++) {
                const span = wordSpans[i];
                if (span.offsetTop > originalTopOffset) {
                    secondRowTopOffset = span.offsetTop;
                    refWord = span; // Update refWord if second line found immediately
                    break;
                }
            }
        }
        // Reset ayah start indices
        currentAyahStartIndex_Main = 0;
        currentAyahStartIndex_NoTashkeel = 0;

        applyModeSettings(); // Apply mode settings (e.g., hide button)

        // Apply initial hide state if active (only in normal/search mode)
        if (isHideAyahsButtonActive) {
            applyHideAyahsVisibility();
        }

        // Focus input field if ready
        if (inputElement && !mainTypingSection.classList.contains('is-hidden')) {
            inputElement.disabled = false;
            inputElement.focus();
        }
    });
}

/**
 * Fills a container with spans, one for each word.
 * @param {string} content - The text content.
 * @param {HTMLElement} container - The container element to fill.
 */
function fillContainerWithSpans(content, container) {
    utils.clearContainer(container);
    // Reset scroll offsets before filling
    originalTopOffset = 0;
    secondRowTopOffset = 0;
    refWord = null;

    const words = content.split(" ");
    words.forEach((word) => {
        if (word) { // Avoid creating spans for empty strings from multiple spaces
            const span = document.createElement('span');
            span.textContent = `${word} `; // Add space back for rendering
            container.appendChild(span);
        }
    });
    // Recalculate original offset *after* filling
     originalTopOffset = utils.getOriginalTopOffset(container);
     // Find second row offset immediately if needed (although it's also done in displaySegmentFromJson)
     const wordSpans = container.querySelectorAll('span');
     if (wordSpans.length > 0) {
         refWord = wordSpans[0];
         for (let i = 1; i < wordSpans.length; i++) {
             if (wordSpans[i].offsetTop > originalTopOffset) {
                 secondRowTopOffset = wordSpans[i].offsetTop;
                 refWord = wordSpans[i];
                 break;
             }
         }
     }
}


// --- Input Handling and Logic (Без существенных изменений) ---
/**
 * Handles the 'input' event on the text field. Compares input with the expected text.
 * Increments error counter on mismatch.
 * @param {Event} event - The input event object.
 */
function handleInput(event) {
    if (startTime === null) {
        startTimer();
    }

    const wordSpans = quranContainer.querySelectorAll('span');
    if (noTashkeelWordIndex >= noTashkeelContainer.childNodes.length || mainQuranWordIndex >= wordSpans.length) {
        return;
    }

    // Защита от ошибки, если узел не текстовый (маловероятно, но возможно)
     if (noTashkeelContainer.childNodes[noTashkeelWordIndex].nodeType !== Node.TEXT_NODE && !noTashkeelContainer.childNodes[noTashkeelWordIndex].textContent) {
         console.warn("Unexpected node type or missing text content in noTashkeelContainer at index", noTashkeelWordIndex);
         // Можно попытаться пропустить этот индекс или остановить обработку
         // Пропуск может нарушить синхронизацию, лучше остановить и отладить
         inputElement.disabled = true; // Блокируем ввод для предотвращения дальнейших ошибок
         showToast("Internal error: Text mismatch. Please reload.");
         return;
     }

    const currentNoTashkeelWord = noTashkeelContainer.childNodes[noTashkeelWordIndex].textContent;
    const inputText = event.target.value;
    const targetWordSpan = wordSpans[mainQuranWordIndex];
    if (!targetWordSpan) return; // Доп. проверка

    if (currentNoTashkeelWord.startsWith(inputText)) {
        targetWordSpan.classList.remove('incorrectWord');
        if (inputText === currentNoTashkeelWord) {
            handleCorrectWord(wordSpans);
        }
    } else {
        if (!targetWordSpan.classList.contains('incorrectWord')) {
            utils.applyIncorrectWordStyle(targetWordSpan);
            incrementError();
        }
    }
}

/**
 * Handles logic when a complete word is typed correctly, including word repetition.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - The list of word spans.
 */
function handleCorrectWord(wordSpans) {
    const correctWordSpan = wordSpans[mainQuranWordIndex];
    utils.applyCorrectWordStyle(correctWordSpan);
    inputElement.value = ""; // Clear input for the next repetition or word

    // --- Word Repetition Logic ---
    if (currentWordRepetition < wordRepeatCount) {
        // ** Repeat Current Word **
        currentWordRepetition++;
        // Optional: Add visual feedback for repetition count here if desired
        // Keep the same indices (mainQuranWordIndex, noTashkeelWordIndex)
        // The input is already cleared, ready for the next typing of the same word.
        correctWordSpan.classList.remove('correctWord'); // Temporarily remove style for re-typing
        // Re-apply hidden style if hide button is active
        if (isHideAyahsButtonActive) {
            correctWordSpan.style.visibility = 'hidden';
        }

    } else {
        // ** Word Repetition Complete, Move On **
        currentWordRepetition = 1; // Reset counter for the *next* word

        // Check if the *next* span marks the end of an ayah BEFORE advancing index
        const isEndOfCurrentAyah = isNextWordAyahMarker(wordSpans, mainQuranWordIndex);

        if (isEndOfCurrentAyah) {
            // --- End of Ayah Reached ---
            if (currentAyahRepetition < ayahRepeatCount) {
                // ** Repeat Current Ayah **
                currentAyahRepetition++;
                showToast(`Repeating Ayah: ${utils.convertToArabicNumber(currentAyahRepetition)} / ${utils.convertToArabicNumber(ayahRepeatCount)}`);

                // Reset UI for the completed ayah (before resetting indices)
                resetCurrentAyahUI(mainQuranWordIndex);

                // Reset indices to the start of the *current* ayah
                mainQuranWordIndex = currentAyahStartIndex_Main;
                noTashkeelWordIndex = currentAyahStartIndex_NoTashkeel;

                // Recalculate scroll offsets based on the new first word of the ayah
                resetScrollOffsets(wordSpans, mainQuranWordIndex);

                // Ensure the first word of the repeated ayah is ready (remove correct style, set visibility)
                const firstWordSpan = wordSpans[mainQuranWordIndex];
                if (firstWordSpan) {
                    firstWordSpan.classList.remove('correctWord', 'incorrectWord');
                    if (isHideAyahsButtonActive) {
                        firstWordSpan.style.visibility = 'hidden';
                    } else {
                        firstWordSpan.style.visibility = 'visible';
                    }
                }


            } else {
                // ** Ayah Repetition Complete, Move to Next Ayah **
                currentAyahRepetition = 1; // Reset ayah repetition counter for the *next* ayah
                handleNextWord(wordSpans); // Advance indices past the current word and the ayah marker
            }
        } else {
            // --- Move to Next Word (within the same ayah) ---
            handleNextWord(wordSpans); // Advance indices to the next word
        }
    }
}


/**
 * Advances the word indices and handles UI updates (scrolling, symbol skipping).
 * Checks if the end of the text has been reached.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - The list of word spans.
 */
function handleNextWord(wordSpans) {
    // Инкрементируем индексы для перехода к следующему слову/символу
    mainQuranWordIndex++;
    noTashkeelWordIndex++;
    currentLetterIndex = 0;

    // --- НАЧАЛО: Проверка на конец текста (сразу после инкремента) ---
    if (mainQuranWordIndex >= wordSpans.length) {
        // Мы обработали последнее слово/символ и вышли за пределы массива
        showToast("Surah Segment Complete!"); // Показываем сообщение о завершении
        if (timerInterval) {
            stopTimer();
            calculateAndDisplayResults();
        }
        inputElement.disabled = true; // Опционально: отключаем поле ввода
        console.log("End of text reached."); // Для отладки
        return; // Прекращаем дальнейшую обработку, так как текст закончился
    }
    // --- КОНЕЦ: Проверка на конец текста ---

    // Если не конец, продолжаем обработку: скроллинг и пропуск символов
    handleOffsetTop(wordSpans, wordSpans[mainQuranWordIndex]);
    handleSymbolSkip(wordSpans); // Пропускаем символы *после* основного инкремента индекса

    // --- НАЧАЛО: Повторная проверка на конец текста (после пропуска символов) ---
    // handleSymbolSkip мог увеличить mainQuranWordIndex до конца или за его пределы
    if (mainQuranWordIndex >= wordSpans.length) {
        // Мы обработали последний символ (который был пропущен) и вышли за пределы
        showToast("Surah Segment Complete!"); // Показываем сообщение о завершении
        if (timerInterval) {
            stopTimer();
            calculateAndDisplayResults();
        }
        inputElement.disabled = true; // Опционально: отключаем поле ввода
        console.log("End of text reached after skipping symbols."); // Для отладки
        return; // Прекращаем дальнейшую обработку
    }
    // --- КОНЕЦ: Повторная проверка на конец текста ---

    // Если текст еще не закончился, подготавливаем следующее слово к вводу
    const nextWordSpan = wordSpans[mainQuranWordIndex];
    if (nextWordSpan && isHideAyahsButtonActive && nextWordSpan.style.visibility !== 'hidden') {
        nextWordSpan.style.visibility = 'hidden'; // Скрываем следующее слово, если активна кнопка "Hide Ayahs"
    }
}

/**
 * Checks if the word span at index + 1 is an ayah end marker `﴿`.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - Word spans.
 * @param {number} currentIndex - Index of the current word span.
 * @returns {boolean} True if the next span is an ayah marker.
 */
function isNextWordAyahMarker(wordSpans, currentIndex) {
    const nextIndex = currentIndex + 1;
    if (nextIndex < wordSpans.length) {
        // Check the content of the *next* span
        const nextWordText = wordSpans[nextIndex].textContent;
        return nextWordText.includes('﴿');
    }
    return false;
}

/**
 * Resets the visual styles for the words of the just-completed ayah.
 * @param {number} lastCorrectWordIndex - Index of the last word span of the ayah.
 */
function resetCurrentAyahUI(lastCorrectWordIndex) {
    const wordSpans = quranContainer.querySelectorAll('span');
    const ayahStartIndex = currentAyahStartIndex_Main;

    for (let i = ayahStartIndex; i <= lastCorrectWordIndex; i++) {
        const span = wordSpans[i];
        if (span) {
            span.classList.remove('correctWord', 'incorrectWord');

            // Reset visibility based on hide button state, but only if not hidden by scrolling
            if (span.style.display !== 'none') {
                if (isHideAyahsButtonActive) {
                    span.style.visibility = 'hidden';
                } else {
                    span.style.visibility = 'visible';
                }
            }
        }
    }
    // Also reset the ayah marker span that follows
    const markerIndex = lastCorrectWordIndex + 1;
    if (markerIndex < wordSpans.length && wordSpans[markerIndex].textContent.includes('﴿')) {
        const markerSpan = wordSpans[markerIndex];
        markerSpan.classList.remove('correctWord', 'incorrectWord');
        if (markerSpan.style.display !== 'none') {
            if (isHideAyahsButtonActive) {
                markerSpan.style.visibility = 'hidden';
            } else {
                markerSpan.style.visibility = 'visible';
            }
        }
    }
}


/**
 * Recalculates scroll-related offsets when repeating an ayah.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - All word spans.
 * @param {number} currentWordIndex - Index of the word the user will type next.
 */
function resetScrollOffsets(wordSpans, currentWordIndex) {
    originalTopOffset = utils.getOriginalTopOffset(quranContainer);
    secondRowTopOffset = 0;
    refWord = null;

    if (currentWordIndex < wordSpans.length) {
        const startingSpan = wordSpans[currentWordIndex];
        refWord = startingSpan; // Start reference is the first word of the repeated ayah

        if (startingSpan.offsetTop > originalTopOffset) {
            originalTopOffset = startingSpan.offsetTop;
        }

        for (let i = currentWordIndex + 1; i < wordSpans.length; i++) {
            const span = wordSpans[i];
            if (span.offsetTop > originalTopOffset) {
                secondRowTopOffset = span.offsetTop;
                refWord = span;
                break;
            }
        }
        // If no second line is found within the ayah, refWord remains the starting span
    }
}

/**
 * Checks and skips Quran symbols, advancing the main index. Updates ayah start indices if marker skipped.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - Word spans.
 */
function handleSymbolSkip(wordSpans) {
    let skippedAyahMarker = false;

    // Пока текущий индекс в пределах массива И текст в текущем span является символом
    while (mainQuranWordIndex < wordSpans.length &&
        QURAN_SYMBOLS.some(char => wordSpans[mainQuranWordIndex].textContent.includes(char))) {
        const symbolSpan = wordSpans[mainQuranWordIndex];
        utils.applyCorrectWordStyle(symbolSpan); // Отмечаем символ как пройденный

        // Проверяем, был ли пропущенный символ маркером аята
        if (symbolSpan.textContent.includes('﴿')) {
            skippedAyahMarker = true;
        }

        // Увеличиваем ТОЛЬКО основной индекс, пропуская символ
        mainQuranWordIndex++;

        // Важно: После пропуска символа, следующее слово может вызвать перенос строки
        // Проверяем это, ТОЛЬКО если мы все еще в пределах массива
        if (mainQuranWordIndex < wordSpans.length) {
            handleOffsetTop(wordSpans, wordSpans[mainQuranWordIndex]);
        } else {
            // Если после пропуска символа мы вышли за пределы, прерываем цикл
            // Завершение текста будет обработано в `handleNextWord` после вызова `handleSymbolSkip`
            break;
        }
    }

    // Если мы пропустили маркер аята и все еще в пределах массива,
    // обновляем стартовые индексы для следующего аята и сбрасываем счетчики повторений
    if (skippedAyahMarker && mainQuranWordIndex < wordSpans.length) {
        currentAyahStartIndex_Main = mainQuranWordIndex;
        // Синхронизируем индекс noTashkeel (он должен быть выровнен после инкремента в handleNextWord)
        currentAyahStartIndex_NoTashkeel = noTashkeelWordIndex;
        // Сбрасываем счетчик повторений аята, так как начинаем новый аят
        currentAyahRepetition = 1;
        // Сбрасываем счетчик повторений слова для первого слова нового аята
        currentWordRepetition = 1;
    }
    // Замечание: Явную проверку на конец текста внутри `handleSymbolSkip` делать не нужно,
    // так как `handleNextWord` выполнит эту проверку после вызова `handleSymbolSkip`.
}


/**
 * Detects line wrapping and handles hiding previous lines.
 * (Implementation based on logicOld.js behavior as requested)
 * Compares subsequent lines against the offset of the *original* second line.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - Word spans.
 * @param {HTMLSpanElement} wordToCheck - The current word span to check.
 */
function handleOffsetTop(wordSpans, wordToCheck) {
    // Защита: Убедимся, что есть слово для проверки и начальное смещение
    if (!wordToCheck || !originalTopOffset) return;

    // Получаем вертикальное смещение текущего слова
    const offsetTop = wordToCheck.offsetTop;

    // Проверяем, сместилось ли слово ниже первой строки
    if (offsetTop > originalTopOffset) {
        // Если secondRowTopOffset еще не установлен (т.е. это первый переход на вторую строку)
        if (secondRowTopOffset === 0) {
            // Запоминаем смещение второй строки
            secondRowTopOffset = offsetTop;
            // Устанавливаем refWord на первое слово этой второй строки
            refWord = wordToCheck;
        }

        // --- Начало логики из logicOld.js ---
        // Проверяем, сместилось ли слово ниже *запомненного* смещения второй строки
        // Это условие будет срабатывать при переходе на третью, четвертую и т.д. строки.
        // Важно: Используем здесь 'if', а не 'else if' (хотя функционально для этого случая разницы нет,
        // т.к. условия взаимоисключающие после первого срабатывания), чтобы точно соответствовать logicOld.
        // Ключевое отличие: secondRowTopOffset НЕ обновляется внутри этого блока.
        if (offsetTop > secondRowTopOffset) {
            // Если да, вызываем функцию для скрытия слов предыдущей строки (до refWord)
            utils.handleHiddenWords(wordSpans, refWord);
            // Обновляем refWord, чтобы он указывал на первое слово *новой* текущей строки
            refWord = wordToCheck;
            // secondRowTopOffset НЕ ОБНОВЛЯЕТСЯ здесь, как в logicOld.js
        }
        // --- Конец логики из logicOld.js ---
    }
}

// --- UI Interaction Handlers ---

/**
 * Toggles the visibility of untyped words and updates the button text.
 */
function handleHideAyahsButton() {
    isHideAyahsButtonActive = !isHideAyahsButtonActive;
    hideAyahsButton.textContent = isHideAyahsButtonActive ? "Show Ayahs" : "Hide Ayahs";
    applyHideAyahsVisibility(); // Apply the change to spans
}

/**
 * Applies the visibility style to word spans based on isHideAyahsButtonActive state.
 */
function applyHideAyahsVisibility() {
    const wordSpans = quranContainer.querySelectorAll('span');
    wordSpans.forEach(span => {
        // Only affect spans not hidden by scrolling ('display: none')
        if (span.style.display !== 'none') {
            // Hide if button active AND span is not already correctly typed
            if (isHideAyahsButtonActive && !span.classList.contains('correctWord')) {
                span.style.visibility = 'hidden';
            } else {
                // Show otherwise (unless it's an incorrect word during word repetition maybe?)
                // Ensure symbols like ayah markers remain visible
                if (!QURAN_SYMBOLS.some(char => span.textContent.includes(char)) && span.classList.contains('incorrectWord')) {
                    // Keep incorrect words hidden if hiding is active? Decide on behavior.
                    // For simplicity, let's make them visible when Show is clicked.
                    span.style.visibility = 'visible';
                } else if (!span.textContent.includes(' ') || !QURAN_SYMBOLS.some(char => span.textContent.includes(char))) {
                    // Make normal words visible if not hiding
                    span.style.visibility = 'visible';
                }
                // Ensure symbols stay visible generally
                if (QURAN_SYMBOLS.some(char => span.textContent.includes(char))) {
                    span.style.visibility = 'visible';
                }
            }
        }
    });
}


/**
 * Processes the search query from the Surah selection input.
 * @param {string} query - The user's input query.
 */
function processSearch(query) {
    query = query.trim();

    if (query === "") {
        // Optionally reload default or do nothing. Let's reload default.
        if (currentSearchQuery !== "1:1") { // Avoid reloading if already at default
             getQuranSegment(SEGMENT_TYPE.SEARCH, "1:1", 'uthmani'); // Use SEARCH type
        }
        return;
    }

    const processedQuery = query.split(/[\\s,:-]+/).filter(Boolean);
    let surahNum = NaN;
    let ayahNum = 1;

    if (processedQuery.length === 0 || processedQuery.length > 2) {
        showToast(`Invalid format. Use Surah:Ayah, Surah Ayah, or just Surah.`);
        return;
    }
    if (processedQuery.some(part => isNaN(part))) {
        showToast(`Please use numbers for Surah and Ayah.`);
        return;
    }

    surahNum = parseInt(processedQuery[0], 10);
    if (surahNum < 1 || surahNum > 114) {
        showToast(`Surah number must be between 1 and 114.`);
        return;
    }

    if (processedQuery.length === 2) {
        ayahNum = parseInt(processedQuery[1], 10);
        // Validation for ayahNum happens inside getQuranSegment now
    }

    // Use the query string "surahNum:ayahNum" as the ID for the search type
    const searchId = `${surahNum}:${ayahNum}`;
    currentSearchQuery = query; // Store the original user query if needed
    // Fetch using the SEARCH type and the combined ID
    getQuranSegment(SEGMENT_TYPE.SURAH, searchId, 'uthmani');
}

/**
 * Displays a short notification message.
 * @param {string} message - The message to display.
 */
function showToast(message) {
    Toastify({
        text: message,
        duration: 3500,
        gravity: "bottom",
        position: 'center',
        close: true,
        style: {
            background: "linear-gradient(to right, #1473e6, #0D66D0)", // Match button color
            color: "#ffffff" // White text
        }
    }).showToast();
}

/**
 * Increments the total error count and updates the display.
 */
function incrementError() {
    totalErrors++;
    updateErrorDisplay();
}

/**
 * Updates the error count display element.
 */
function updateErrorDisplay() {
    if (errorCountDisplay) { // Check if element exists
        errorCountDisplay.textContent = totalErrors;
    }
}

// --- Timer Functions (Без изменений) ---
/**
 * Updates the timer display element with the current elapsed time (HH:MM:SS.ms).
 */
function updateTimerDisplay() {
    if (!startTime || !timerDisplayElement) return;
    const now = endTime ? endTime : Date.now();
    const elapsedMilliseconds = now - startTime;
    timerDisplayElement.textContent = utils.formatTime(elapsedMilliseconds);
}
/**
 * Starts the timer. Records the start time and sets a frequent interval for millisecond updates.
 */
function startTimer() {
    if (startTime !== null) return;
    if (timerInterval) clearInterval(timerInterval);
    startTime = Date.now();
    endTime = null;
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 50);
}
/**
 * Stops the timer by clearing the interval.
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        endTime = Date.now();
        updateTimerDisplay(); // Final update for accuracy
    }
}
/**
 * Resets the timer: stops it, resets start time, and sets display to "00:00:00.000".
 */
function resetTimer() {
    stopTimer();
    startTime = null;
    endTime = null;
    if (timerDisplayElement) {
        timerDisplayElement.textContent = "00:00:00.000";
    }
}

// --- Table Population and Handling ---

/**
 * Populates the Surah selection table.
 */
function populateSurahSelectionTable() {
    if (!PROPERTIES_OF_SURAHS?.chapters || !surahSelectionTBody) {
        console.error("Surah data or table body not available for populating.");
        if (surahSelectionTBody) surahSelectionTBody.innerHTML = '<tr><td colspan="15">Failed to load Surah list.</td></tr>';
        return;
    }
    surahSelectionTBody.innerHTML = ''; // Clear previous rows
    const allResults = loadAllResults();

    PROPERTIES_OF_SURAHS.chapters.forEach(chapter => {
        const row = document.createElement('tr');
        row.dataset.segmentId = chapter.id; // Use generic dataset attribute

        row.innerHTML = `
            <td>${chapter.id}</td>
            <td style="font-family: 'IslamicFont', sans-serif;">${chapter.name_arabic}</td>
            <td>${chapter.name_simple}</td>
            <td>${chapter.revelation_place.charAt(0).toUpperCase() + chapter.revelation_place.slice(1)}</td>
            <td>${utils.convertToArabicNumber(chapter.verses_count)}</td>
        `;

        ['normal', 'blind'].forEach(mode => {
            // ИЗМЕНЕНО: Используем SEGMENT_TYPE.SURAH при получении результата
            const resultData = getResult(SEGMENT_TYPE.SURAH, chapter.id, mode);
            const displayTime = resultData?.time ?? '-';
            const displayErrors = resultData?.errors ?? '-';
            const displayScore = resultData?.score ?? '-';
            const displayRank = resultData?.rank ?? '-';

            row.innerHTML += `
                <td class="result-time-${mode}">${displayTime}</td>
                <td class="result-errors-${mode}">${displayErrors}</td>
                <td class="result-score-${mode}">${displayScore}</td>
                <td class="result-rank-${mode}">${displayRank}</td>
                <td class="has-text-centered">
                    <button class="button is-ghost start-segment-button" data-mode="${mode}">Start</button>
                </td>
            `;
        });
        surahSelectionTBody.appendChild(row);
    });

    // Add event listener using delegation
    surahSelectionTBody.addEventListener('click', handleStartSegment);
}


// ДОБАВЛЕНО: Функция для заполнения общих таблиц (Juz, Hizb, Rub, Page)
/**
 * Populates a generic selection table (Juz, Hizb, Rub', Page).
 * @param {string} type - The segment type (SEGMENT_TYPE constant).
 * @param {number} count - The total number of segments of this type.
 * @param {HTMLElement} tbodyElement - The tbody element of the table.
 * @param {string} labelPrefix - The label prefix (e.g., "Juz", "Hizb").
 */
function populateGenericSelectionTable(type, count, tbodyElement, labelPrefix) {
    if (!tbodyElement) {
        console.error(`Table body not found for type: ${type}`);
        return;
    }
    tbodyElement.innerHTML = ''; // Clear previous rows
    const allResults = loadAllResults();

    for (let i = 1; i <= count; i++) {
        const row = document.createElement('tr');
        row.dataset.segmentId = i; // Use generic dataset attribute

        row.innerHTML = `<td>${labelPrefix} ${i}</td>`; // Cell for the number/label

        ['normal', 'blind'].forEach(mode => {
            const resultData = getResult(type, i, mode); // Use type here
            const displayTime = resultData?.time ?? '-';
            const displayErrors = resultData?.errors ?? '-';
            const displayScore = resultData?.score ?? '-';
            const displayRank = resultData?.rank ?? '-';

            row.innerHTML += `
                <td class="result-time-${mode}">${displayTime}</td>
                <td class="result-errors-${mode}">${displayErrors}</td>
                <td class="result-score-${mode}">${displayScore}</td>
                <td class="result-rank-${mode}">${displayRank}</td>
                <td class="has-text-centered">
                    <button class="button is-ghost start-segment-button" data-mode="${mode}">Start</button>
                </td>
            `;
        });
        tbodyElement.appendChild(row);
    }
     // Add event listener using delegation
    tbodyElement.addEventListener('click', handleStartSegment);
}


// ИЗМЕНЕНО: Общий обработчик для всех кнопок Start
/**
 * Handles clicks on the "Start" buttons within any selection table.
 * @param {Event} event - The click event object.
 */
function handleStartSegment(event) {
    const clickedButton = event.target.closest('.start-segment-button');
    if (!clickedButton) return; // Click wasn't on a start button

    const clickedRow = clickedButton.closest('tr');
    const tbodyElement = clickedRow?.parentElement; // Get the parent tbody
    if (!tbodyElement || !clickedRow?.dataset.segmentId) {
         console.error("Could not find row, tbody, or segment ID for clicked button.");
         return; // Failed to find row or segment ID
    }

    const selectedSegmentId = clickedRow.dataset.segmentId; // Get ID from row
    const selectedMode = clickedButton.dataset.mode; // Get mode from button

    // Determine the type based on the tbody's ID
    let selectedType;
    switch (tbodyElement.id) {
        case 'surah-selection-tbody': selectedType = SEGMENT_TYPE.SURAH; break;
        case 'juz-selection-tbody': selectedType = SEGMENT_TYPE.JUZ; break;
        case 'hizb-selection-tbody': selectedType = SEGMENT_TYPE.HIZB; break;
        case 'rub-selection-tbody': selectedType = SEGMENT_TYPE.RUB; break;
        case 'page-selection-tbody': selectedType = SEGMENT_TYPE.PAGE; break;
        default:
             console.error("Unknown tbody ID:", tbodyElement.id);
             return;
    }


    if (selectedSegmentId && selectedMode && selectedType) {
        // Save the selected parameters (type is already set by switch)
        currentSelectionId = selectedSegmentId; // Save the ID (might be number or string for surah)
        currentMode = selectedMode;     // Save selected mode

        // Hide selection table view
        if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden');
        // Show main typing interface
        if (mainTypingSection) mainTypingSection.classList.remove('is-hidden');

        // Load the selected segment
        getQuranSegment(selectedType, selectedSegmentId, 'uthmani');

        // Apply mode-specific UI settings immediately
        applyModeSettings();

    } else {
         console.error("Missing data for starting segment:", { selectedSegmentId, selectedMode, selectedType });
    }
}


// --- View Toggling ---

/**
 * Toggles visibility between the main typing interface and the selection table view.
 */
function toggleSurahSelectionView() {
    if (!mainTypingSection || !surahSelectionSection) return;

    const isTypingVisible = !mainTypingSection.classList.contains('is-hidden');

    if (isTypingVisible) {
        // --- Switching FROM typing TO selection view ---
        mainTypingSection.classList.add('is-hidden');
        surahSelectionSection.classList.remove('is-hidden');
        stopTimer(); // Stop timer if running
        // Clear search input and typing input when switching TO selection
        const surahInputElement = document.getElementById("Surah-selection-input");
        if (surahInputElement) surahInputElement.value = '';
        if (inputElement) {
            inputElement.value = ''; // Clear typing field
            inputElement.classList.remove('incorrectWord');
        }
        // ДОБАВЛЕНО: Опционально, обновляем данные таблиц при показе
        // Это полезно, если результаты могли измениться во время печати
        // Но может быть медленно, если таблицы большие. Пока не будем обновлять.
        // populateAllSelectionTables(); // Раскомментировать для обновления при каждом показе
    } else {
        // --- Switching FROM selection view TO typing ---
        surahSelectionSection.classList.add('is-hidden');
        mainTypingSection.classList.remove('is-hidden');

        applyModeSettings(); // Ensure Hide Ayahs button state is correct

        // Enable and focus input if content is already loaded
        if (inputElement && quranContainer.hasChildNodes()) {
            inputElement.disabled = false;
            inputElement.focus();
        } else if (!quranContainer.hasChildNodes()) {
            // If no content (e.g., initial load error), load default
            getQuranSegment(SEGMENT_TYPE.SURAH, "1:1", 'uthmani'); // Load default Surah
        }
    }
}

// --- Results Calculation and Storage ---

/**
 * Calculates and displays the final results (CPM, Score, Rank)
 */
function calculateAndDisplayResults() {
    // Check if timer actually ran and segment has characters
    if (!startTime || !endTime || totalCharsInSegment <= 0) {
        console.warn("Cannot calculate results: Timer not run or no characters.", { startTime, endTime, totalCharsInSegment });
        resetResultsDisplay();
        // Don't save results if they can't be calculated
        return;
    }

    const elapsedMilliseconds = endTime - startTime;
    const numberOfErrors = totalErrors;
    const numberOfChars = totalCharsInSegment;

    // 1. Base metrics
    const cpm = utils.calculateCPM(numberOfChars, elapsedMilliseconds);
    const errorRate = utils.calculateErrorRate(numberOfErrors, numberOfChars);
    const adjustedCPM = utils.calculateAdjustedCPM(cpm, numberOfErrors);

    // 2. Final score
    const score = utils.calculateScore(adjustedCPM, TARGET_CPM);

    // 3. Rank
    const rank = utils.determineRank(score, errorRate);

    // 4. Display results
    if (acpmDisplay) acpmDisplay.textContent = Math.round(adjustedCPM);
    if (scoreDisplay) scoreDisplay.textContent = `${score}%`;
    if (rankDisplay) rankDisplay.textContent = rank;

    // --- Save Result ---
    // Only save if the segment was started from a selection table (not search)
    // AND if we have a valid type and ID
    if (currentSelectionType !== SEGMENT_TYPE.SEARCH && currentSelectionId !== null) {
         const formattedTime = utils.formatTime(elapsedMilliseconds);
         const resultData = {
             score: score,
             time: formattedTime,
             errors: numberOfErrors,
             rank: rank
         };
         saveResult(currentSelectionType, currentSelectionId, currentMode, resultData);
    } else {
        console.log("Result not saved (Search mode or invalid ID/Type)");
    }
    console.log(`Results - Type: ${currentSelectionType}, ID: ${currentSelectionId}, Mode: ${currentMode} | Time: ${utils.formatTime(elapsedMilliseconds)}, Errors: ${numberOfErrors}, Chars: ${numberOfChars}, CPM: ${cpm.toFixed(0)}, aCPM: ${adjustedCPM.toFixed(0)}, Score: ${score}, Rank: ${rank}`); // Debugging
}


/**
 * Resets the result display elements to their initial state.
 */
function resetResultsDisplay() {
    if (acpmDisplay) acpmDisplay.textContent = "-";
    if (scoreDisplay) scoreDisplay.textContent = "-";
    if (rankDisplay) rankDisplay.textContent = "-";
}

// ИЗМЕНЕНО: Функции работы с Local Storage для поддержки типов
/**
 * Loads all saved results from Local Storage.
 * @returns {object} Object with results like { type: { id: { mode: result } } } or empty object.
 */
function loadAllResults() {
    try {
        const storedResults = localStorage.getItem(RESULTS_STORAGE_KEY);
        // Basic validation: check if it's parseable JSON
        if (storedResults) {
            const parsed = JSON.parse(storedResults);
             // Add a check to ensure it's an object (basic structure check)
             if (typeof parsed === 'object' && parsed !== null) {
                 return parsed;
             } else {
                 console.warn("Stored results format is invalid, returning empty object.");
                 localStorage.removeItem(RESULTS_STORAGE_KEY); // Clear invalid data
                 return {};
             }
        }
        return {};
    } catch (error) {
        console.error("Error loading results from Local Storage:", error);
         // Attempt to clear potentially corrupted data
         localStorage.removeItem(RESULTS_STORAGE_KEY);
        return {}; // Return empty object on error
    }
}

/**
 * Gets saved result for a specific segment type, ID, and mode.
 * @param {string} type Segment type (SEGMENT_TYPE constant).
 * @param {number|string} id Segment ID.
 * @param {'normal'|'blind'} mode Mode.
 * @returns {object | null} Result object { score, time, errors, rank } or null.
 */
function getResult(type, id, mode) {
    const allResults = loadAllResults();
    // Check if type exists, then id, then mode
    return allResults?.[type]?.[id]?.[mode] || null;
}

/**
 * Saves result for a specific segment type, ID, and mode to Local Storage.
 * Only saves if the new score is better than the existing one.
 * @param {string} type Segment type (SEGMENT_TYPE constant).
 * @param {number|string} id Segment ID.
 * @param {'normal'|'blind'} mode Mode.
 * @param {object} resultData Result object { score, time, errors, rank }.
 */
function saveResult(type, id, mode, resultData) {
    // Basic validation
    if (!type || id === null || id === undefined || !mode || !resultData || typeof resultData.score !== 'number') {
        console.error("Cannot save result: Invalid data provided.", { type, id, mode, resultData });
        return;
    }

    const allResults = loadAllResults();

    // Ensure structure exists
    if (!allResults[type]) {
        allResults[type] = {};
    }
    if (!allResults[type][id]) {
        allResults[type][id] = {};
    }

    const existingResult = allResults[type][id]?.[mode];
    let shouldSave = true; // Assume we should save by default

    if (existingResult && typeof existingResult.score === 'number') {
        // Compare scores only if existing score is a valid number
        if (resultData.score <= existingResult.score) {
            console.log(`Result for ${type} ${id} (${mode}) not saved (Score ${resultData.score} is not better than ${existingResult.score})`);
            shouldSave = false; // Don't save if score isn't better
        }
    }

    if (shouldSave) {
        allResults[type][id][mode] = resultData; // Save or overwrite result
        if (!existingResult || resultData.score > (existingResult?.score ?? -1) ) {
             showToast("New Record!"); // Show only if it's a new record or better score
        }


        try {
            localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(allResults));
            console.log(`Result saved for ${type} ${id} (${mode}):`, resultData);
            // Update the display in the corresponding table immediately
             updateSegmentTableResultDisplay(type, id, mode, resultData);
        } catch (error) {
            console.error("Error saving results to Local Storage:", error);
            showToast("Could not save your result.");
        }
    }
}


// ИЗМЕНЕНО: Обновление отображения результата в таблице
/**
 * Updates the result display (Time, Errors, Score, Rank) in the specific selection table row.
 * @param {string} type Segment type (SEGMENT_TYPE constant).
 * @param {number|string} id Segment ID.
 * @param {'normal'|'blind'} mode Mode.
 * @param {object} resultData New result object { score, time, errors, rank }.
 */
function updateSegmentTableResultDisplay(type, id, mode, resultData) {
    let tbodyElement;
    // Find the correct tbody based on type
    switch (type) {
        case SEGMENT_TYPE.SURAH: tbodyElement = surahSelectionTBody; break;
        case SEGMENT_TYPE.JUZ: tbodyElement = juzSelectionTBody; break;
        case SEGMENT_TYPE.HIZB: tbodyElement = hizbSelectionTBody; break;
        case SEGMENT_TYPE.RUB: tbodyElement = rubSelectionTBody; break;
        case SEGMENT_TYPE.PAGE: tbodyElement = pageSelectionTBody; break;
        default: return; // Unknown type
    }

    if (!tbodyElement || !resultData) return;

    // Find the row using the data-segment-id attribute
    const row = tbodyElement.querySelector(`tr[data-segment-id="${id}"]`);
    if (!row) {
        console.warn(`Row not found in table for ${type} ${id}`);
        return;
    }

    // Find cells by class within the row
    const timeCell = row.querySelector(`.result-time-${mode}`);
    const errorsCell = row.querySelector(`.result-errors-${mode}`);
    const scoreCell = row.querySelector(`.result-score-${mode}`);
    const rankCell = row.querySelector(`.result-rank-${mode}`);

    // Format data for display (handle null/undefined)
    const displayTime = resultData.time ?? '-';
    const displayErrors = resultData.errors ?? '-';
    const displayScore = resultData.score ?? '-';
    const displayRank = resultData.rank ?? '-';

    // Update cell content
    if (timeCell) timeCell.textContent = displayTime;
    if (errorsCell) errorsCell.textContent = displayErrors;
    if (scoreCell) scoreCell.textContent = displayScore;
    if (rankCell) rankCell.textContent = displayRank;
}

// --- Tab Switching Logic --- ДОБАВЛЕНО
/**
 * Handles clicks on the tab links.
 * @param {Event} event - The click event.
 */
function handleTabClick(event) {
    const clickedTab = event.currentTarget; // The <li> element
    const targetTabName = clickedTab.dataset.tab;

    if (!targetTabName || clickedTab.classList.contains('is-active')) {
        return; // Do nothing if clicking the active tab or invalid tab
    }

    // Remove 'is-active' from all tabs and hide all content
    tabLinks.forEach(link => link.classList.remove('is-active'));
    tabContentContainers.forEach(container => container.classList.add('is-hidden'));

    // Activate the clicked tab
    clickedTab.classList.add('is-active');

    // Show the corresponding content
    const targetContent = document.getElementById(`tab-content-${targetTabName}`);
    if (targetContent) {
        targetContent.classList.remove('is-hidden');
    } else {
        console.error(`Tab content not found for: tab-content-${targetTabName}`);
    }
}

/**
 * Handles keydown events globally, specifically looking for the Escape key to restart.
 * @param {KeyboardEvent} event The keyboard event object.
 */
function handleRestartKey(event) {
    // Check if the pressed key is Escape
    if (event.key === 'Escape') {
        // Check if the main typing section is currently visible
        // and if we have a valid segment selected (type and ID are not null)
        if (mainTypingSection && !mainTypingSection.classList.contains('is-hidden') &&
            currentSelectionType !== null && currentSelectionId !== null)
        {
            // Prevent default Escape behavior (like closing modals, if any were present)
            event.preventDefault();

            // Show a confirmation toast
            // showToast(`Restarting ${currentSelectionType} ${currentSelectionId}`);

            // Call getQuranSegment with the currently selected type and ID to restart
            // The getQuranSegment function already handles resetting state.
            // We keep the current script ('uthmani') and current mode.
            getQuranSegment(currentSelectionType, currentSelectionId, 'uthmani');
        }
    }
}

// --- Event Listeners Setup ---

/**
 * Adds all necessary event listeners to the UI elements.
 */
function addListeners() {
    // Dark Mode Toggle
    document.getElementById('dark-mode-toggle').addEventListener('click', () => {
        isDarkMode = utils.toggleDarkMode(isDarkMode);
    });

    // Hide Ayahs Button (only works in normal/search mode)
    hideAyahsButton.addEventListener('click', handleHideAyahsButton);

    // Main Input Field
    inputElement.addEventListener("input", handleInput);
    inputElement.addEventListener("focus", () => { // Clear potential error style on focus
        const wordSpans = quranContainer.querySelectorAll('span');
        if (mainQuranWordIndex < wordSpans.length) {
             const currentSpan = wordSpans[mainQuranWordIndex];
             if (currentSpan) { // Check if span exists
                currentSpan.classList.remove('incorrectWord');
             }
        }
    });

    // Ayah Repetition Input
    repeatCountInput.addEventListener('change', (event) => {
        const newCount = parseInt(event.target.value, 10);
        ayahRepeatCount = (!isNaN(newCount) && newCount >= 1) ? newCount : 1;
        event.target.value = ayahRepeatCount; // Update input field
         if (ayahRepeatCount !== newCount) showToast("Ayah repetition count must be 1 or greater.");
    });
    repeatCountInput.addEventListener('input', (event) => { // Allow only numbers
        event.target.value = event.target.value.replace(/[^0-9]/g, '');
    });

    // Word Repetition Input
    wordRepeatCountInput.addEventListener('change', (event) => {
        const newCount = parseInt(event.target.value, 10);
        wordRepeatCount = (!isNaN(newCount) && newCount >= 1) ? newCount : 1;
         event.target.value = wordRepeatCount; // Update input field
         if (wordRepeatCount !== newCount) showToast("Word repetition count must be 1 or greater.");
    });
    wordRepeatCountInput.addEventListener('input', (event) => { // Allow only numbers
        event.target.value = event.target.value.replace(/[^0-9]/g, '');
    });


    // Surah Selection Input and Button (Top Search Bar)
    const surahInputElement = document.getElementById("Surah-selection-input");
    const surahProcessButton = document.getElementById("Display-Surah-button");

    surahProcessButton.addEventListener("click", () => {
        processSearch(surahInputElement.value); // This now calls getQuranSegment with type SEARCH
    });
    surahInputElement.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            processSearch(surahInputElement.value); // This now calls getQuranSegment with type SEARCH
        }
    });

    // Toggle Selection View Button
    if (changeSurahButton) {
        changeSurahButton.addEventListener('click', toggleSurahSelectionView);
    }

     // --- ДОБАВЛЕНО: Tab Link Listeners ---
     if (tabLinks) {
        tabLinks.forEach(link => {
            link.addEventListener('click', handleTabClick);
        });
    }

    // --- ИЗМЕНЕНО: Start Button listeners are now added dynamically in population functions ---
    // The handleStartSegment function handles events via delegation.

    // Auto-focus on the main input field when the page loads (if typing section is visible)
     document.addEventListener("DOMContentLoaded", () => {
        if (!mainTypingSection.classList.contains('is-hidden') && inputElement) {
           inputElement.focus();
        }
    });

    // Global listener for the Escape key to restart the current segment
    document.addEventListener('keydown', handleRestartKey);
}

// --- Application Entry Point ---

// ДОБАВЛЕНО: Функция для вызова всех функций заполнения таблиц
function populateAllSelectionTables() {
    populateSurahSelectionTable();
    populateGenericSelectionTable(SEGMENT_TYPE.JUZ, COUNT.JUZ, juzSelectionTBody, "Juz");
    populateGenericSelectionTable(SEGMENT_TYPE.HIZB, COUNT.HIZB, hizbSelectionTBody, "Hizb");
    populateGenericSelectionTable(SEGMENT_TYPE.RUB, COUNT.RUB, rubSelectionTBody, "Rub'");
    populateGenericSelectionTable(SEGMENT_TYPE.PAGE, COUNT.PAGE, pageSelectionTBody, "Page");
}

/**
 * Initializes the application.
 */
function runApp() {
    cacheDOMElements();
    utils.initDarkMode(isDarkMode);
    addListeners();
    resetResultsDisplay(); // Reset footer display

    setupSurahData()
        .then(() => {
            // Populate selection tables in the background (they are initially hidden)
            populateAllSelectionTables();

            // Ensure typing section is visible and selection section is hidden initially
            if (mainTypingSection) mainTypingSection.classList.remove('is-hidden');
            if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden');

            // Load the default Surah 1, Ayah 1 for the typing view
             // Set initial state before loading
            currentSelectionType = SEGMENT_TYPE.SURAH; // Default type
            currentSelectionId = 1; // Default ID
            currentMode = 'normal'; // Default mode
            currentSearchQuery = "1:1";
            getQuranSegment(SEGMENT_TYPE.SURAH, 1, 'uthmani'); // Load Surah 1

        })
        .catch(error => {
            console.error('Error during application initialization:', error);
            showToast("Failed to initialize application data. Please refresh.");
            resetResultsDisplay();
            // Show error message in the main typing area
            if (mainTypingSection) mainTypingSection.classList.remove('is-hidden');
            if (quranContainer) quranContainer.innerHTML = '<p class="has-text-danger has-text-centered">Error loading data. Try refreshing the page.</p>';
            if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden');
            if (errorCountDisplay) errorCountDisplay.textContent = "Error";
            if (inputElement) inputElement.disabled = true;
            if (acpmDisplay) acpmDisplay.textContent = "Error";
            if (scoreDisplay) scoreDisplay.textContent = "Error";
            if (rankDisplay) rankDisplay.textContent = "Error";
        });
}

// Run the application
runApp();