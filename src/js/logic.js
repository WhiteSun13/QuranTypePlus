import utils from './utils.js';

const BASMALLA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
// Added ayah marker start '﴿' to the list for easier checking
const QURAN_SYMBOLS = ["۞", "﴾","﴿", "۩", 'ۖ', 'ۗ', 'ۘ', 'ۙ', 'ۚ', ' ۛ' , 'ۜ', 'ۛ ']
let PROPERTIES_OF_SURAHS = null

// --- UI State ---
const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
let isDarkMode = localStorage.getItem('darkMode') === 'enabled' || prefersDarkMode;
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

// --- Auto-Scroll Detection State ---
let originalTopOffset = 0 // Top offset of the first line
let secondRowTopOffset = 0 // Top offset of the second line (once it appears)
let refWord = null // Reference word span used for hiding previous lines

// --- DOM Element References (Cache frequently used elements) ---
let quranContainer = null;
let noTashkeelContainer = null;
let inputElement = null;
let errorCountDisplay = null; 
let repeatCountInput = null;
let wordRepeatCountInput = null; // Added

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
    currentLetterIndex = 0;
    mainQuranWordIndex = 0;
    noTashkeelWordIndex = 0;
    
    currentAyahRepetition = 1; // Reset ayah repetition count
    currentWordRepetition = 1; // Reset word repetition count
    
    currentAyahStartIndex_Main = 0; 
    currentAyahStartIndex_NoTashkeel = 0; 
    
    totalErrors = 0; // Reset error count
    updateErrorDisplay(); // Update the display to show 0 errors

    originalTopOffset = 0; 
    secondRowTopOffset = 0;
    refWord = null;
    
    inputElement.value = ""; // Clear input field
    inputElement.classList.remove('incorrectWord'); // Ensure input isn't styled incorrectly initially

    // Reset hide words state visually if needed (e.g., button text)
    // if (isHideAyahsButtonActive) { handleHideAyahsButton(); } // Toggle off if desired


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
        
        displaySurahFromJson(data, startAyah, script);

    } catch (error) {
        console.error('Error fetching verses:', error);
        showToast("Error fetching Surah data. Please try again.");
    } finally {
         // Hide loading indicator (optional)
        // showLoadingIndicator(false);
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

         // Apply initial hide state if active
         if (isHideAyahsButtonActive) {
             applyHideAyahsVisibility();
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
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - The list of word spans.
 */
function handleNextWord(wordSpans) {
    mainQuranWordIndex++;
    noTashkeelWordIndex++;
    currentLetterIndex = 0; 

    if (mainQuranWordIndex < wordSpans.length) {
        handleOffsetTop(wordSpans, wordSpans[mainQuranWordIndex]);
        handleSymbolSkip(wordSpans); // Skip symbols *after* advancing index

         // After potentially skipping symbols, ensure the next word is ready
         const nextWordSpan = wordSpans[mainQuranWordIndex];
         if (nextWordSpan && isHideAyahsButtonActive && nextWordSpan.style.visibility !== 'hidden') {
             nextWordSpan.style.visibility = 'hidden'; // Hide next word if button active
         }

    } else {
        showToast("Surah Segment Complete!"); // Or load next part
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
             // Ayah markers usually remain visible even when hiding words
             markerSpan.style.visibility = 'visible'; 
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

    while (mainQuranWordIndex < wordSpans.length &&
           QURAN_SYMBOLS.some(char => wordSpans[mainQuranWordIndex].textContent.includes(char)))
    {
        const symbolSpan = wordSpans[mainQuranWordIndex];
        utils.applyCorrectWordStyle(symbolSpan); // Mark symbol as passed

        if (symbolSpan.textContent.includes('﴿')) {
            skippedAyahMarker = true;
        }

        mainQuranWordIndex++; // Increment main index past the symbol

        if (mainQuranWordIndex < wordSpans.length) {
            // Important: Handle potential line wrap caused by the word *after* the symbol
            handleOffsetTop(wordSpans, wordSpans[mainQuranWordIndex]);
        } else {
            break; // Reached end of content
        }
    }

    // If we skipped an ayah marker, the *new* mainQuranWordIndex is the start of the next ayah
    if (skippedAyahMarker && mainQuranWordIndex < wordSpans.length) {
        currentAyahStartIndex_Main = mainQuranWordIndex;
        // Sync noTashkeel index (it should be aligned after handleNextWord increments)
        currentAyahStartIndex_NoTashkeel = noTashkeelWordIndex; 
        // Reset ayah repetition counter as we are starting a new ayah segment
        currentAyahRepetition = 1; 
        // Reset word repetition as well for the first word of the new ayah
        currentWordRepetition = 1; 
    }
}


/**
 * Detects line wrapping and handles hiding previous lines.
 * @param {NodeListOf<HTMLSpanElement>} wordSpans - Word spans.
 * @param {HTMLSpanElement} wordToCheck - The current word span to check.
 */
function handleOffsetTop(wordSpans, wordToCheck) {
     if (!wordToCheck || !originalTopOffset) return; // Need word and initial offset

    const offsetTop = wordToCheck.offsetTop;

    // First time moving past the very first line
    if (offsetTop > originalTopOffset && secondRowTopOffset === 0) {
        secondRowTopOffset = offsetTop; 
        refWord = wordToCheck; 
    }
    // Subsequent line wraps (moved past the second recorded line)
    else if (secondRowTopOffset > 0 && offsetTop > secondRowTopOffset) {
        utils.handleHiddenWords(wordSpans, refWord); // Hide words before the previous refWord
        refWord = wordToCheck; // Update refWord to the first word of the *new* current line
        secondRowTopOffset = offsetTop; // Update the offset for the next wrap detection
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
}

// --- Application Entry Point ---

/**
 * Initializes the application.
 * @param {number} [initialSurah=1] - Initial Surah number.
 * @param {number} [initialAyah=1] - Initial Ayah number.
 * @param {string} [initialScript='uthmani'] - Initial script.
 */
function runApp(initialSurah = 1, initialAyah = 1, initialScript = 'uthmani') {
    cacheDOMElements(); // Cache elements first
    utils.initDarkMode(isDarkMode); 
    addListeners(); 

    setupSurahData()
        .then(() => {
            // Set initial search query state *before* calling getSurah
            currentSearchQuery = `${initialSurah}:${initialAyah}`;
            getSurah(initialSurah, initialAyah, initialScript);
        })
        .catch(error => {
            console.error('Error during application initialization:', error);
            showToast("Failed to initialize application data. Please refresh.");
            // Display error state in UI?
            if(errorCountDisplay) errorCountDisplay.textContent = "Error";
        });
}

// Run the application
runApp(1, 1); 