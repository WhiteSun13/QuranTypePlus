import utils from './utils.js';

const BASMALLA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
// Added ayah marker start '﴿' to the list for easier checking
const QURAN_SYMBOLS = ["۞", "﴾","﴿", "۩", 'ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', ' ۛ' , 'ۜ', 'ۛ ']
let PROPERTIES_OF_SURAHS = null
const TARGET_CPM = 400;

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

// --- Ranking ---
let currentMode = 'normal'; // 'normal' or 'blind' - Текущий выбранный режим
let currentSurahId = null; // ID текущей запущенной суры для сохранения результатов
const RESULTS_STORAGE_KEY = 'quranTypePlusResults'; // Ключ для Local Storage
let totalCharsInSegment = 0; // Общее количество символов в текущем сегменте для расчета CPM
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
let hideAyahsButton = null; // Добавим ссылку на кнопку Hide Ayahs

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
    surahSelectionTBody = document.getElementById('surah-selection-tbody');
    changeSurahButton = document.getElementById('change-surah-button');
    hideAyahsButton = document.getElementById('hideAyahsButton');
    acpmDisplay = document.getElementById("acpmDisplay");
    scoreDisplay = document.getElementById("scoreDisplay");
    rankDisplay = document.getElementById("rankDisplay");
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

/**
 * Fetches and displays a specific Surah or part of a Surah.
 * Resets state variables for the new segment.
 * @param {number} surahNumber - The number of the Surah (1-114).
 * @param {number} startAyah - The ayah number to start from.
 * @param {string} script - The Quran script to use (e.g., 'uthmani').
 */
async function getSurah(surahNumber, startAyah, script) {
    // --- Reset State for New Surah/Ayah ---
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

    // ДОБАВИТЬ: Сброс количества символов
    totalCharsInSegment = 0;
    // ДОБАВИТЬ: Сброс отображения результатов
    resetResultsDisplay();

    originalTopOffset = 0;
    secondRowTopOffset = 0;
    refWord = null;

    inputElement.value = ""; // Clear input field
    inputElement.classList.remove('incorrectWord'); // Ensure input isn't styled incorrectly initially
    inputElement.disabled = false; // *** ДОБАВЛЕНО: Убедимся, что поле ввода активно при загрузке нового текста ***

    // Reset hide words state visually if needed (e.g., button text)
    // if (isHideAyahsButtonActive) { handleHideAyahsButton(); } // Toggle off if desired

    // ДОБАВИТЬ: Устанавливаем ID суры, если она загружается через поиск
    // Мы не меняем currentMode здесь, он устанавливается только при клике на кнопку Start в таблице
    // Если пользователь ищет вручную, можно считать это 'normal' режимом по умолчанию?
    // Или нужно как-то дать выбрать режим и для поиска? Пока оставим как есть.
    // Если сура загружена через поиск, а не кнопку Start, currentSurahId может быть не установлен.
    // Установим его здесь для корректного сохранения, если пользователь завершит печатать.
    currentSurahId = surahNumber;
    // Можно также сбросить currentMode на 'normal', если это предполагаемое поведение для поиска.
    currentMode = 'UserSearch'; // Раскомментировать, если поиск всегда должен быть 'normal'
    applyModeSettings(); // Применить настройки для 'normal' режима

    // Constructing the API URL
    const baseApiUrl = 'https://api.quran.com/api/v4';
    const url = `${baseApiUrl}/quran/verses/${script}?chapter_number=${surahNumber}`;

    // Show loading indicator (optional)
    // showLoadingIndicator(true);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch verses');
        }
        const data = await response.json();
        const totalAyahs = data.verses.length;

        // Validate startAyah
        if (startAyah < 1) {
             startAyah = 1;
        } else if (startAyah > totalAyahs) {
            const surahName = PROPERTIES_OF_SURAHS.chapters[surahNumber - 1].name_simple;
            showToast(`${surahName} only contains ${utils.convertToArabicNumber(totalAyahs)} ayahs. Starting from Ayah ${utils.convertToArabicNumber(1)}.`);
            startAyah = 1;
        }

        applyModeSettings(); // Вызываем здесь тоже на всякий случай
        displaySurahFromJson(data, startAyah, script);

    } catch (error) {
        console.error('Error fetching verses:', error);
        showToast("Error fetching Surah data. Please try again.");
    } finally {
         // Hide loading indicator (optional)
        // showLoadingIndicator(false);
        if (inputElement && !mainTypingSection.classList.contains('is-hidden')) {
            inputElement.disabled = false;
            inputElement.focus();
        }
    }
}

/**
 * Применяет настройки UI в зависимости от текущего режима (currentMode).
 * В основном, скрывает/показывает кнопку "Hide Ayahs".
 */
function applyModeSettings() {
    if (!hideAyahsButton) return; // Убедимся, что кнопка найдена

    if (currentMode === 'blind') {
        hideAyahsButton.style.display = 'none'; // Скрываем кнопку в слепом режиме
        // Убедимся, что текст НЕ скрыт принудительно, если пользователь переключился на слепой режим
        // после активации кнопки Hide в нормальном режиме
        if (!isHideAyahsButtonActive) {
             handleHideAyahsButton(); // "Нажимаем" кнопку, чтобы показать аяты, если были скрыты
        }
    } else { // currentMode === 'normal'
        hideAyahsButton.style.display = ''; // Показываем кнопку в нормальном режиме (сброс на display по умолчанию)
        // Состояние кнопки (нажата/не нажата) сохраняется из переменной isHideAyahsButtonActive
        // и применяется в applyHideAyahsVisibility при необходимости
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
 * Prepares the verse data: trims whitespace, slices based on startAyah.
 * @param {object} data - The raw API response data.
 * @param {number} startAyah - The ayah number to start from.
 * @param {string} script - The script type.
 * @returns {object} The processed data object.
 */
function processData(data, startAyah, script) {
    const textProp = `text_${script}`;
    if (data.verses.length > 0 && data.verses[0][textProp].startsWith(' ')) {
        data.verses[0][textProp] = data.verses[0][textProp].trim();
    }
    data.verses = data.verses.slice(startAyah - 1);
    return data;
}

/**
 * Displays the fetched Surah content and sets up related elements.
 * @param {object} data - The processed API response data.
 * @param {number} startAyah - The starting ayah number.
 * @param {string} script - The script type.
 */
function displaySurahFromJson(data, startAyah, script) {
    const surahNameEl = document.getElementById("Surah-name");
    const basmallahContainer = document.getElementById("Basmallah");
    
    data = processData(data, startAyah, script); 
    const noTashkeelAyahs = []; 

    const surahContent = data.verses.map((ayah, i) => {
        const currentAyahNumber = startAyah + i;
        const arabicNumber = utils.convertToArabicNumber(currentAyahNumber);
        const processedAyah = processAyah(ayah[`text_${script}`]);
        noTashkeelAyahs.push(processedAyah); 
        return `${processedAyah} ﴿${arabicNumber}﴾`; 
    }).join(" "); 

    const chapterInfo = PROPERTIES_OF_SURAHS.chapters[data.meta.filters.chapter_number - 1];
    surahNameEl.textContent = `سورة ${chapterInfo.name_arabic}`;

    if (startAyah === 1 && chapterInfo.bismillah_pre) {
        basmallahContainer.textContent = BASMALLA;
    } else {
        basmallahContainer.textContent = ""; 
    }

    document.fonts.ready.then(() => {
        fillContainerWithSpans(surahContent, quranContainer);
        
        const noTashkeelString = utils.createNoTashkeelString(noTashkeelAyahs);
        utils.fillContainer(noTashkeelString, noTashkeelContainer); // Use utility for hidden div

        // ДОБАВИТЬ: Рассчитываем общее кол-во символов для CPM
        // Используем длину строки без ташкиля, так как именно ее сравниваем при вводе.
        // Удаляем пробелы для более точного подсчета символов (опционально, зависит от того, считать ли пробелы)
        // Если считать пробелы, просто используем noTashkeelString.length
        totalCharsInSegment = noTashkeelString.replace(/\s/g, '').length;
        // Или если пробелы считать: totalCharsInSegment = noTashkeelString.length;
        // console.log("Total characters for segment:", totalCharsInSegment); // Для отладки

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
         currentAyahStartIndex_Main = 0; 
         currentAyahStartIndex_NoTashkeel = 0;

         applyModeSettings();

        // Apply initial hide state if active (только если режим нормальный)
        if (currentMode === 'normal' && isHideAyahsButtonActive) {
             applyHideAyahsVisibility();
        }

        // ДОБАВИТЬ: Фокусировка на поле ввода после готовности
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
    originalTopOffset = utils.getOriginalTopOffset(container);
    const words = content.split(" ");
    words.forEach((word) => {
        if (word) { 
            const span = document.createElement('span');
            span.textContent = `${word} `; 
            container.appendChild(span);
        }
    });
}

// --- Input Handling and Logic ---

/**
 * Handles the 'input' event on the text field. Compares input with the expected text.
 * Increments error counter on mismatch.
 * @param {Event} event - The input event object.
 */
function handleInput(event) {
    // Запускаем таймер, если он еще не запущен
    if (startTime === null) {
        startTimer();
    }
    
    const wordSpans = quranContainer.querySelectorAll('span');
    
    // Basic boundary checks
    if (noTashkeelWordIndex >= noTashkeelContainer.childNodes.length || mainQuranWordIndex >= wordSpans.length) {
        // console.warn("Index out of bounds, possibly end of Surah/Ayah segment.");
        return; 
    }

    const currentNoTashkeelWord = noTashkeelContainer.childNodes[noTashkeelWordIndex].textContent;
    const inputText = event.target.value; 
    const targetWordSpan = wordSpans[mainQuranWordIndex];
    if (!targetWordSpan) return;

    // Compare the full input value with the expected word segment
    if (currentNoTashkeelWord.startsWith(inputText)) {
        // Input is currently correct or partially correct
        targetWordSpan.classList.remove('incorrectWord'); // Remove error style if it was applied
        
        // Check if the full word has been typed correctly
        if (inputText === currentNoTashkeelWord) {
            handleCorrectWord(wordSpans);
        } 
    } else {
        // Incorrect input character(s) entered
        if (!targetWordSpan.classList.contains('incorrectWord')) { // Count error only once per incorrect attempt
            utils.applyIncorrectWordStyle(targetWordSpan);
            incrementError(); // Increment and update the error count
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
        stopTimer();
        calculateAndDisplayResults();
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
        stopTimer();
        calculateAndDisplayResults();
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
           QURAN_SYMBOLS.some(char => wordSpans[mainQuranWordIndex].textContent.includes(char)))
    {
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
    const button = document.getElementById('hideAyahsButton'); 
    button.textContent = isHideAyahsButtonActive ? "Show Ayahs" : "Hide Ayahs";
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
    if (currentSearchQuery === query && query !== "") { // Don't research same if not empty
        return;
    }
   
    if (query === "") {
        // Optionally reload default or do nothing. Let's reload default.
        if (currentSearchQuery !== "1:1") { // Avoid reloading if already at default
             currentSearchQuery = "1:1"; 
             getSurah(1, 1, 'uthmani');
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
        if (ayahNum < 1) {
            showToast(`Ayah number must be 1 or greater. Starting from Ayah 1.`);
            ayahNum = 1; 
        }
    }
    
    currentSearchQuery = query; // Store the valid query
    getSurah(surahNum, ayahNum, 'uthmani');
}

/**
 * Displays a short notification message.
 * @param {string} message - The message to display.
 */
function showToast(message) {
    Toastify({
        text: message,
        duration: 3500, // Slightly shorter
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

// --- НАЧАЛО: Обновленные функции таймера ---

/**
 * Updates the timer display element with the current elapsed time (HH:MM:SS.ms).
 */
function updateTimerDisplay() {
    // Не обновлять, если таймер не запущен или элемент не найден
    if (!startTime || !timerDisplayElement) return;

    // Используем endTime если таймер остановлен, иначе текущее время
    const now = endTime ? endTime : Date.now();
    const elapsedMilliseconds = now - startTime;

    // Форматируем и отображаем время с помощью обновленной утилиты
    timerDisplayElement.textContent = utils.formatTime(elapsedMilliseconds);
}

/**
 * Starts the timer. Records the start time and sets a frequent interval for millisecond updates.
 */
function startTimer() {
    // Запускаем, только если таймер еще не запущен (startTime не установлен)
    if (startTime !== null) {
        console.log("Timer already running.");
        return;
    }

    // Останавливаем любой предыдущий интервал на всякий случай
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    // Записываем время начала
    startTime = Date.now();
    endTime = null; // Сбрасываем время окончания при старте
    // Немедленно обновляем дисплей (покажет 00:00:00.000)
    updateTimerDisplay();
    // Устанавливаем интервал для частого обновления (например, каждые 50мс)
    // Это компромисс между плавностью и производительностью
    timerInterval = setInterval(updateTimerDisplay, 50); // Обновляем 20 раз в секунду
    // console.log("Timer started"); // Для отладки
}

/**
 * Stops the timer by clearing the interval.
 */
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        endTime = Date.now();
        // Выполним последнее обновление для точности, так как интервал мог сработать позже
        updateTimerDisplay();
        console.log("Timer stopped at:", endTime); // Для отладки
    }
}

/**
 * Resets the timer: stops it, resets start time, and sets display to "00:00:00.000".
 */
function resetTimer() {
    stopTimer(); // Останавливаем таймер
    startTime = null; // !!! Важно: Сбрасываем startTime, чтобы startTimer сработал при следующем вводе
    endTime = null; // Сбрасываем и время окончания
    if (timerDisplayElement) {
        // Сбрасываем текст на дисплее
        timerDisplayElement.textContent = "00:00:00.000";
    }
    // console.log("Timer reset"); // Для отладки
}

function populateSurahSelectionTable() {
    if (!PROPERTIES_OF_SURAHS || !PROPERTIES_OF_SURAHS.chapters || !surahSelectionTBody) {
        console.error("Surah data or table body not available for populating.");
        // Можно отобразить сообщение об ошибке в таблице
        surahSelectionTBody.innerHTML = '<tr><td colspan="15">Не удалось загрузить список сур.</td></tr>';
        return;
    }

    // Очищаем предыдущие строки (если есть)
    surahSelectionTBody.innerHTML = '';
    const allResults = loadAllResults();

    // Заполняем таблицу данными
    PROPERTIES_OF_SURAHS.chapters.forEach(chapter => {
        const row = document.createElement('tr');
        row.setAttribute('data-surah-id', chapter.id); // Сохраняем ID суры для обработчика клика

        // Создаем ячейки для каждой колонки
        const cellId = document.createElement('td');
        cellId.textContent = chapter.id;

        const cellNameArabic = document.createElement('td');
        cellNameArabic.textContent = chapter.name_arabic;
        cellNameArabic.style.fontFamily = "'IslamicFont', sans-serif"; // Применяем шрифт Корана

        const cellNameSimple = document.createElement('td');
        cellNameSimple.textContent = chapter.name_simple;

        const cellRevelationPlace = document.createElement('td');
        cellRevelationPlace.textContent = chapter.revelation_place.charAt(0).toUpperCase() + chapter.revelation_place.slice(1); // Делаем первую букву заглавной

        const cellVersesCount = document.createElement('td');
        cellVersesCount.textContent = utils.convertToArabicNumber(chapter.verses_count); // Используем арабские цифры

        // Добавляем ячейки в строку
        row.appendChild(cellId);
        row.appendChild(cellNameArabic);
        row.appendChild(cellNameSimple);
        row.appendChild(cellRevelationPlace);
        row.appendChild(cellVersesCount);
        
        // --- Ячейки для режимов (Normal: 5-8, Blind: 9-12) ---
        ['normal', 'blind'].forEach(mode => {
            const resultData = allResults[chapter.id]?.[mode] || null; // Получаем результат

            // Форматируем данные для отображения (или ставим '-')
            // const displayTime = resultData?.time ? resultData.time.split(':').slice(1).join(':') : '-'; // MM:SS.sss
            const displayTime = resultData?.time ? resultData.time : '-'; // HH:MM:SS.sss
            const displayErrors = resultData?.errors ?? '-'; // Используем ?? для null/undefined
            const displayScore = resultData?.score ?? '-';
            const displayRank = resultData?.rank ?? '-';

            // Ячейка для Времени (Time)
            const cellTime = document.createElement('td');
            cellTime.className = `result-time-${mode}`; // Добавляем классы для легкого поиска при обновлении
            cellTime.textContent = displayTime;
            row.appendChild(cellTime);

            // Ячейка для Ошибок (Missclick)
            const cellErrors = document.createElement('td');
            cellErrors.className = `result-errors-${mode}`;
            cellErrors.textContent = displayErrors;
            row.appendChild(cellErrors);

            // Ячейка для Очков (Score)
            const cellScore = document.createElement('td');
            cellScore.className = `result-score-${mode}`;
            cellScore.textContent = displayScore;
            row.appendChild(cellScore);

            // Ячейка для Ранга (Rank)
            const cellRank = document.createElement('td');
            cellRank.className = `result-rank-${mode}`;
            cellRank.textContent = displayRank;
            row.appendChild(cellRank);

            // Ячейка для Кнопки (Start)
            const cellButton = document.createElement('td');
            const startButton = document.createElement('button');
            cellButton.className = 'has-text-centered';
            startButton.className = 'button is-ghost start-surah-button';
            startButton.dataset.mode = mode;
            startButton.textContent = 'Start';
            cellButton.appendChild(startButton);
            row.appendChild(cellButton);
        });

        // Добавляем строку в тело таблицы
        surahSelectionTBody.appendChild(row);
    });

    // Добавляем обработчик событий на тело таблицы (event delegation)
    surahSelectionTBody.addEventListener('click', handleStartSurah);
}

/**
 * Handles clicks on the "Start" buttons within the Surah selection table.
 * @param {Event} event - The click event object.
 */
function handleStartSurah(event) {
    // Проверяем, был ли клик именно по кнопке "Start"
    const clickedButton = event.target.closest('.start-surah-button');
    if (!clickedButton) {
        return; // Клик не по кнопке, ничего не делаем
    }

    const clickedRow = clickedButton.closest('tr');
    if (!clickedRow || !clickedRow.dataset.surahId) {
        return; // Не удалось найти строку или ID суры
    }

    const selectedSurahId = parseInt(clickedRow.dataset.surahId, 10);
    const selectedMode = clickedButton.dataset.mode; // Получаем режим из data-атрибута кнопки

    if (!isNaN(selectedSurahId) && (selectedMode === 'normal' || selectedMode === 'blind')) {
        // Сохраняем выбранные параметры
        currentSurahId = selectedSurahId; // Сохраняем ID суры для последующего сохранения результата
        currentMode = selectedMode;     // Сохраняем выбранный режим

        // Скрываем таблицу выбора
        if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden');
        // Показываем основной интерфейс ввода
        if (mainTypingSection) mainTypingSection.classList.remove('is-hidden');

        // Загружаем выбранную суру (всегда с первого аята)
        // processSearch уже обрабатывает формат "число:число", поэтому используем его
        processSearch(`${selectedSurahId}:1`);

        // Дополнительно: Применяем специфичные для режима настройки UI *сразу*
         applyModeSettings();

    }
}

// --- ДОБАВЛЕНО: Функция для переключения видимости секций ---
/**
 * Toggles visibility between the main typing interface and the Surah selection table.
 */
function toggleSurahSelectionView() {
    if (!mainTypingSection || !surahSelectionSection) return;

    const isTypingVisible = !mainTypingSection.classList.contains('is-hidden');

    if (isTypingVisible) {
        // --- Переключаемся С ввода НА выбор суры ---
        mainTypingSection.classList.add('is-hidden');
        surahSelectionSection.classList.remove('is-hidden');
        stopTimer();
        // resetTimer(); 
        // Очищаем поле поиска и ввода при переходе к выбору суры
        const surahInputElement = document.getElementById("Surah-selection-input");
        if (surahInputElement) surahInputElement.value = '';
        if (inputElement) {
             inputElement.value = ''; // Очищаем поле ввода текста Корана
             inputElement.classList.remove('incorrectWord'); // Убираем стиль ошибки
        }
    } else {
        // --- Переключаемся С выбора суры НА ввод ---
        surahSelectionSection.classList.add('is-hidden');
        mainTypingSection.classList.remove('is-hidden');

        applyModeSettings(); // Убедимся, что кнопка Hide Ayahs отображается/скрыта правильно

        // Разблокируем поле ввода и фокусируемся, если сура уже загружена
        if (inputElement && quranContainer.hasChildNodes()) { // Проверяем, есть ли контент
             inputElement.disabled = false;
             inputElement.focus();
        } else if (!quranContainer.hasChildNodes()) {
             // Если сура еще не загружена (например, при первом запуске была ошибка),
             // можно загрузить суру по умолчанию или оставить поле заблокированным
             // Давайте загрузим по умолчанию для надежности
             processSearch("1:1");
        }
    }
}

/**
 * Calculates and displays the final results (CPM, Score, Rank)
 */
function calculateAndDisplayResults() {
    if (!startTime || !endTime) {
        console.warn("Cannot calculate results: Timer was not stopped properly.");
        resetResultsDisplay(); // Сбрасываем отображение, если времени нет
        return;
    }

    const elapsedMilliseconds = endTime - startTime;
    const numberOfErrors = totalErrors;
    const numberOfChars = totalCharsInSegment; // Используем сохраненное значение

    // Проверка на валидность данных перед расчетом
    if (numberOfChars <= 0) {
        console.warn("Cannot calculate results: No characters in the segment.");
        resetResultsDisplay(); // Сбрасываем, если нет символов
        return;
    }

    // 1. Базовые метрики
    const cpm = utils.calculateCPM(numberOfChars, elapsedMilliseconds);
    const errorRate = utils.calculateErrorRate(numberOfErrors, numberOfChars);
    const adjustedCPM = utils.calculateAdjustedCPM(cpm, numberOfErrors);

    // 2. Итоговый балл
    const score = utils.calculateScore(adjustedCPM, TARGET_CPM);

    // 3. Ранг
    const rank = utils.determineRank(score, errorRate);

    // 4. Отображение результатов
    if (acpmDisplay) acpmDisplay.textContent = Math.round(adjustedCPM); // Отображаем округленный aCPM
    if (scoreDisplay) scoreDisplay.textContent = `${score}%`; // Отображаем счет с %
    if (rankDisplay) rankDisplay.textContent = rank; // Отображаем ранг

    // --- ДОБАВЛЕНО: Сохранение и обновление таблицы ---
    const formattedTime = utils.formatTime(elapsedMilliseconds); // Получаем форматированное время для сохранения
    const resultData = {
        score: score,
        time: formattedTime,
        errors: numberOfErrors,
        rank: rank
    };

    // Сохраняем результат, используя текущие ID суры и режим
    saveResult(currentSurahId, currentMode, resultData);

    // Обновляем отображение результата в таблице выбора сур
    updateTableResultDisplay(currentSurahId, currentMode, resultData);

    console.log(`CPM: ${cpm}, ER: ${errorRate}%, aCPM: ${adjustedCPM}, Score: ${score}, ${adjustedCPM / TARGET_CPM}, Rank: ${rank}`); // Для отладки
}

/**
 * Resets the result display elements to their initial state.
 */
function resetResultsDisplay() {
    if (acpmDisplay) acpmDisplay.textContent = "-";
    if (scoreDisplay) scoreDisplay.textContent = "-";
    if (rankDisplay) rankDisplay.textContent = "-";
}

/**
 * Загружает все сохраненные результаты из Local Storage.
 * @returns {object} Объект с результатами вида { surahId: { normal: result, blind: result } } или пустой объект.
 */
function loadAllResults() {
    try {
        const storedResults = localStorage.getItem(RESULTS_STORAGE_KEY);
        return storedResults ? JSON.parse(storedResults) : {};
    } catch (error) {
        console.error("Error loading results from Local Storage:", error);
        return {}; // Возвращаем пустой объект в случае ошибки
    }
}

/**
 * Получает сохраненный результат для конкретной суры и режима.
 * @param {number|string} surahId ID суры.
 * @param {'normal'|'blind'} mode Режим ('normal' или 'blind').
 * @returns {object | null} Объект с результатом { time, errors, rank } или null, если результат не найден.
 */
function getResult(surahId, mode) {
    const allResults = loadAllResults();
    return allResults[surahId]?.[mode] || null;
}

/**
 * Сохраняет результат для конкретной суры и режима в Local Storage.
 * @param {number|string} surahId ID суры.
 * @param {'normal'|'blind'} mode Режим ('normal' или 'blind').
 * @param {object} resultData Объект с результатом { time: string, errors: number, rank: string }.
 */
function saveResult(surahId, mode, resultData) {
    if (!surahId || !mode || !resultData) {
        console.error("Cannot save result: Invalid data provided.", { surahId, mode, resultData });
        return;
    }
    const allResults = loadAllResults();
    if (!allResults[surahId]) {
        allResults[surahId] = {}; // Создаем запись для суры, если ее нет
    }

    if (allResults[surahId][mode]) {
        if (allResults[surahId][mode].score >= resultData.score){
            console.log("Результат хуже");
            return;
        }
    }

    try {
        localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(allResults));
        console.log(`Result saved for Surah ${surahId}, Mode ${mode}:`, resultData); // Отладка
    } catch (error) {
        console.error("Error saving results to Local Storage:", error);
        showToast("Could not save your result."); // Уведомляем пользователя
    }
}

/**
 * Обновляет отображение результата (Time, Errors, Rank) в таблице выбора сур после завершения.
 * @param {number|string} surahId ID суры, для которой обновляем результат.
 * @param {'normal'|'blind'} mode Режим, для которого обновляем результат.
 * @param {object} resultData Новый объект результата { score, time, errors, rank }.
 */
function updateTableResultDisplay(surahId, mode, resultData) {
    if (!surahSelectionTBody || !resultData) return;
    const allResults = loadAllResults();
    if (!allResults[surahId]) {
        allResults[surahId] = {}; // Создаем запись для суры, если ее нет
    }
    
    if (allResults[surahId][mode]) {
        if (allResults[surahId][mode].score >= resultData.score){
            console.log("Результат хуже");
            return;
        }
    }

    const row = surahSelectionTBody.querySelector(`tr[data-surah-id="${surahId}"]`);
    if (!row) return;

    // Находим ячейки по добавленным классам
    const timeCell = row.querySelector(`.result-time-${mode}`);
    const errorsCell = row.querySelector(`.result-errors-${mode}`);
    const scoreCell = row.querySelector(`.result-score-${mode}`);
    const rankCell = row.querySelector(`.result-rank-${mode}`);

    // Форматируем данные для отображения
    const displayTime = resultData.time ?? '-';
    const displayErrors = resultData.errors ?? '-';
    const displayScore = resultData.score ?? '-';
    const displayRank = resultData.rank ?? '-';

    // Обновляем текст в ячейках
    if (timeCell) {
        timeCell.textContent = displayTime;
    }
    if (errorsCell) {
        errorsCell.textContent = displayErrors;
    }
    if (scoreCell) {
        scoreCell.textContent = displayScore;
    }
    if (rankCell) {
        rankCell.textContent = displayRank;
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

    // Hide Ayahs Button
    document.getElementById('hideAyahsButton').addEventListener('click', handleHideAyahsButton);

    // Main Input Field
    inputElement.addEventListener("input", handleInput);
    inputElement.addEventListener("focus", () => { // Clear potential error style on focus
        const wordSpans = quranContainer.querySelectorAll('span');
         if (mainQuranWordIndex < wordSpans.length) {
            wordSpans[mainQuranWordIndex].classList.remove('incorrectWord');
         }
    });
    
    // Ayah Repetition Input
    repeatCountInput.addEventListener('change', (event) => { 
        const newCount = parseInt(event.target.value, 10);
        if (!isNaN(newCount) && newCount >= 1) {
            ayahRepeatCount = newCount;
        } else {
            event.target.value = ayahRepeatCount; // Revert if invalid
            showToast("Ayah repetition count must be 1 or greater.");
        }
    });
    repeatCountInput.addEventListener('input', (event) => { // Prevent non-numeric faster
         event.target.value = event.target.value.replace(/[^0-9]/g, '');
     });

     // Word Repetition Input (New)
    wordRepeatCountInput.addEventListener('change', (event) => { 
        const newCount = parseInt(event.target.value, 10);
        if (!isNaN(newCount) && newCount >= 1) {
            wordRepeatCount = newCount;
             // Reset current word repetition if count changes mid-word? Optional.
             // currentWordRepetition = 1; // Let's not reset for now.
        } else {
            event.target.value = wordRepeatCount; // Revert if invalid
            showToast("Word repetition count must be 1 or greater.");
        }
    });
    wordRepeatCountInput.addEventListener('input', (event) => { // Prevent non-numeric faster
         event.target.value = event.target.value.replace(/[^0-9]/g, '');
     });


    // Surah Selection Input and Button
    const surahInputElement = document.getElementById("Surah-selection-input");
    const surahProcessButton = document.getElementById("Display-Surah-button");

    surahProcessButton.addEventListener("click", () => {
        processSearch(surahInputElement.value);
    });
    surahInputElement.addEventListener("keypress", (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); 
            processSearch(surahInputElement.value);
        }
    });

    // Auto-focus on the main input field when the page loads
    document.addEventListener("DOMContentLoaded", () => {
        inputElement.focus();
    });

    if (changeSurahButton) {
        changeSurahButton.addEventListener('click', toggleSurahSelectionView);
    };
}

// --- Application Entry Point ---

/**
 * Initializes the application.
 * @param {number} [initialSurah=1] - Initial Surah number.
 * @param {number} [initialAyah=1] - Initial Ayah number.
 * @param {string} [initialScript='uthmani'] - Initial script.
 */
function runApp(initialSurah = 1, initialAyah = 1, initialScript = 'uthmani') {
    cacheDOMElements();
    utils.initDarkMode(isDarkMode);
    addListeners();
    resetResultsDisplay();

    setupSurahData()
        .then(() => {
            // Заполняем таблицу В ФОНЕ (она пока скрыта)
            populateSurahSelectionTable();

            // --- Возвращаем загрузку суры по умолчанию ---
            currentSearchQuery = `${initialSurah}:${initialAyah}`;
            if(inputElement) inputElement.disabled = false;
            // Убедимся, что секция ввода видима, а выбора - скрыта ПЕРЕД загрузкой суры
             if (mainTypingSection) mainTypingSection.classList.remove('is-hidden');
             if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden');
             // Загружаем суру
            getSurah(initialSurah, initialAyah, initialScript);
            // --- Конец возврата ---

        })
        .catch(error => {
            console.error('Error during application initialization:', error);
            showToast("Failed to initialize application data. Please refresh.");
            resetResultsDisplay();
             // Показываем ошибку, например, в основной секции
             if (mainTypingSection) mainTypingSection.classList.remove('is-hidden'); // Показать секцию
             if (quranContainer) quranContainer.innerHTML = '<p class="has-text-danger has-text-centered">Error loading data. Try refreshing the page.</p>'; // Сообщение об ошибке
             if (surahSelectionSection) surahSelectionSection.classList.add('is-hidden'); // Скрыть секцию выбора
            if(errorCountDisplay) errorCountDisplay.textContent = "Error";
            if(inputElement) inputElement.disabled = true;
            if(acpmDisplay) acpmDisplay.textContent = "Error"; // Доп. индикация
            if(scoreDisplay) scoreDisplay.textContent = "Error";
            if(rankDisplay) rankDisplay.textContent = "Error";
        });
}

// Run the application
runApp(1, 1);