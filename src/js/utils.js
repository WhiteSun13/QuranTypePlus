export function convertToArabicNumber(englishNumber) {
    englishNumber = englishNumber.toString()

    const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    const englishDigits = "0123456789";
    const englishToArabicMap = {};

    for (let i = 0; i < englishDigits.length; i++) {
        englishToArabicMap[englishDigits[i]] = arabicNumbers[i];
    }

    const arabicNumber = englishNumber.replace(/\d/g, (match) => englishToArabicMap[match]);

    return arabicNumber;
}

export function createNoTashkeelString(noTashkeelAyahs) {
    noTashkeelAyahs = noTashkeelAyahs.map((ayah) => removeTashkeel(ayah))

    let processedString = noTashkeelAyahs.join(" ")

    // This handles an issue with \u06D6-\u06DE (the stop signs). They become spaces when removed.
    // This results in 2 consecutive spaces. This is replaced with one space using this code.
    processedString = processedString.replace(/\s{2,}/g, ' ');
    return processedString
}

export function removeTashkeel(text) {
    let noTashkeel = text

    noTashkeel = noTashkeel.replace(/\u0670/g, '\u0627');  // replace the small subscript alef with normal alef
    noTashkeel = noTashkeel.replace(/\u0671/g, '\u0627');  // replace the alef wasl with alef

    // fix an issue with the ya encoding
    // (persian for some reason). Note this replaces all normal ya, but also the ya for alef layena.
    //  so for something like فى it is written في. Not sure if this is fine, check with someone arabic literate
    noTashkeel = noTashkeel.replace(/\u06CC/g, '\u064A');

    // handle hamza above the line extender char. (the part below removes this char, so we have to handle here.)
    noTashkeel = noTashkeel.replace(/\u0640\u0654/g, '\u0626'); // ya


    // this removes everything that isnt a main char, or a hamza above or below, or a spacebar
    // noTashkeel = noTashkeel.replace(/[^\u0621-\u063A\u0641-\u064A\u0654-\u0655 ]/g, '');
    noTashkeel = noTashkeel.replace(/[^\u0621-\u063A\u0641-\u064A\u0654-\u0655 ]/g, '');

    // // change the ya with hamza underneath and to ya with hamza above as this is available on keyboard
    noTashkeel = noTashkeel.replace(/\u0649\u0655/g, '\u0626');

    // fixes a bug with words like: الأيات . the lam then alef then hamza causes an issue.
    noTashkeel = noTashkeel.replace(/\u0654\u0627/g, '\u0623');
    noTashkeel = noTashkeel.replace(/\u0655\u0627/g, '\u0625');

    // for ya and waw with hamza above (Havent checked if they apply). 
    noTashkeel = noTashkeel.replace(/\u0654\u0648/g, '\u0624'); // waw
    noTashkeel = noTashkeel.replace(/\u0654\u064A/g, '\u0626'); // ya

    return noTashkeel
}

// for local debugging
function toUnicode(text) {
    let unicode = '';
    for (let i = 0; i < text.length; i++) {
        unicode += '\\u' + text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
    }
    return unicode;
}
// console.log(toUnicode("هَدَىٰكُمْ"));
// console.log(toUnicode(removeTashkeel("هَدَىٰكُمْ")));
// console.log(removeTashkeel('هَدَىٰكُمْ'));

export function applyIncorrectWordStyle(incorrectWord) {
    incorrectWord.classList.remove('correctWord');
    incorrectWord.classList.add('incorrectWord');
}

export function applyCorrectWordStyle(correctWord) {
    correctWord.classList.remove('incorrectWord');
    correctWord.classList.add('correctWord');

    // Unhide word if hidden due to hideWords button. (The working is none, delete hidden later)
    if (correctWord.style.visibility === 'hidden') {
        correctWord.style.visibility = "visible";
    }
}

/**
 * Gets the original offsetTop of the *first* element within the container.
 * This is used as a baseline to detect when content wraps to the next line.
 * @param {HTMLElement} container The container element (e.g., quranContainer).
 * @returns {number} The offsetTop value of the first child element, or 0 if the container is empty or the first child has no offsetTop.
 */
export function getOriginalTopOffset(container) {
    // Check if the container has any child nodes and the first child is an element with an offsetTop property
    if (container.firstChild && container.firstChild.offsetTop !== undefined) {
        // Return the offsetTop of the very first child element
        // This gives the vertical position of the beginning of the content.
        return container.firstChild.offsetTop;
    }

    // Return 0 or a default value if the container is empty or the first child isn't valid for offset calculation.
    // This prevents errors if the container is somehow empty when this function is called.
    console.warn("Could not determine originalTopOffset: Container might be empty or first child is not an element.");
    return 0;
}

export function handleHiddenWords(wordSpans, referenceSpan) {
    let foundReference = false;

    wordSpans.forEach((span) => {
        if (!foundReference) {
            if (span === referenceSpan) {
                foundReference = true;
            } else {
                span.style.display = 'none';
                // span.remove()
            }
        }
    });
}

export function clearContainer(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}

export function getTransitionDuration(element) {
    // Get the computed style of the element
    const style = window.getComputedStyle(element);

    // Extract the 'transition-duration' property value
    const transitionDuration = style.getPropertyValue('transition-duration');

    // Convert the string value to a number in milliseconds
    return parseFloat(transitionDuration) * 1000;
}

// Using this now for the tashkeel container.
export function fillContainer(surahContent, container) {
    clearContainer(container)

    // turn each word into a span
    const words = surahContent.split(" ")
    // console.log(words.join(" "));


    words.forEach((word) => {
        const wordSpan = document.createElement("span");
        wordSpan.textContent = `${word} `
        container.appendChild(wordSpan)

        // temp
        // console.log(word.split(""));
    });
}

export function initDarkMode(isDarkMode) {
    const root = document.documentElement; // Используем <html>
    if (isDarkMode) {
        root.classList.remove('light');
        root.classList.add('dark');
        // Обновляем иконки (если они все еще используются с таким id)
        const lightIcon = document.getElementById('light-mode-icon');
        const darkIcon = document.getElementById('dark-mode-icon');
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'inline-block'; // Используем inline-block для img
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
        const lightIcon = document.getElementById('light-mode-icon');
        const darkIcon = document.getElementById('dark-mode-icon');
        if (lightIcon) lightIcon.style.display = 'inline-block';
        if (darkIcon) darkIcon.style.display = 'none';
    }
    // Сохраняем начальное состояние в localStorage, если его нет
    if (localStorage.getItem('darkMode') === null) {
        localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    }
}

// Function to toggle dark mode
export function toggleDarkMode(isDarkMode) {
    const root = document.documentElement; // Используем <html>
    isDarkMode = !isDarkMode; // Переключаем состояние

    if (isDarkMode) {
        root.classList.remove('light');
        root.classList.add('dark');
        const lightIcon = document.getElementById('light-mode-icon');
        const darkIcon = document.getElementById('dark-mode-icon');
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'inline-block';
    } else {
        root.classList.remove('dark');
        root.classList.add('light');
        const lightIcon = document.getElementById('light-mode-icon');
        const darkIcon = document.getElementById('dark-mode-icon');
        if (lightIcon) lightIcon.style.display = 'inline-block';
        if (darkIcon) darkIcon.style.display = 'none';
    }

    // Save the dark mode preference
    localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    return isDarkMode; // Возвращаем новое состояние
}

/**
 * Formats total elapsed milliseconds into HH:MM:SS.ms string format.
 * @param {number} elapsedMilliseconds - The total elapsed time in milliseconds.
 * @returns {string} The formatted time string (e.g., "00:01:30.550").
 */
export function formatTime(elapsedMilliseconds) {
    // Обработка случая, если передано не число или отрицательное значение
    if (isNaN(elapsedMilliseconds) || elapsedMilliseconds < 0) {
        elapsedMilliseconds = 0;
    }

    // Вычисляем компоненты времени
    const totalSeconds = Math.floor(elapsedMilliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor(elapsedMilliseconds % 1000); // Используем floor для целых миллисекунд

    // Добавляем ведущие нули
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    // Форматируем миллисекунды до 3 знаков
    const formattedMilliseconds = String(milliseconds).padStart(3, '0');

    // Возвращаем отформатированную строку
    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}.${formattedMilliseconds}`;
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} value The number to clamp.
 * @param {number} min The minimum allowed value.
 * @param {number} max The maximum allowed value.
 * @returns {number} The clamped number.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Calculates Characters Per Minute (CPM).
 * @param {number} totalChars Total number of characters typed (or expected).
 * @param {number} elapsedMilliseconds Total elapsed time in milliseconds.
 * @returns {number} The calculated CPM. Returns 0 if time is 0.
 */
export function calculateCPM(totalChars, elapsedMilliseconds) {
    if (elapsedMilliseconds <= 0) {
        return 0; // Avoid division by zero or negative time
    }
    const timeInMinutes = elapsedMilliseconds / 60000; // Convert ms to minutes
    return totalChars / timeInMinutes;
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Calculates the Error Rate (ER) as a percentage.
 * @param {number} totalErrors Total number of errors made.
 * @param {number} totalChars Total number of characters typed (or expected).
 * @returns {number} The error rate percentage. Returns 0 if no characters were typed.
 */
export function calculateErrorRate(totalErrors, totalChars) {
    if (totalChars <= 0) {
        return 0; // Avoid division by zero
    }
    return (totalErrors / totalChars) * 100;
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Calculates the Adjusted CPM (aCPM) after applying penalty for errors.
 * @param {number} cpm The raw Characters Per Minute.
 * @param {number} totalErrors Total number of errors made.
 * @returns {number} The adjusted CPM, cannot be less than 0.
 */
export function calculateAdjustedCPM(cpm, totalErrors) {
    const penalty = totalErrors; // Penalty is 1 CPM per error
    return Math.max(0, cpm - penalty);
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Calculates the final score based on aCPM and a target CPM.
 * @param {number} aCPM The adjusted Characters Per Minute.
 * @param {number} targetCPM The target CPM for a 100% score.
 * @returns {number} The final score (0-100).
 */
export function calculateScore(aCPM, targetCPM) {
    if (targetCPM <= 0) {
        return 0; // Avoid division by zero if targetCPM is invalid
    }
    const rawScore = (aCPM / targetCPM) * 100;
    const roundedScore = Math.round(rawScore);
    return clamp(roundedScore, 0, 100); // Clamp the score between 0 and 100
}

// ДОБАВИТЬ ЭТУ ФУНКЦИЮ
/**
 * Determines the rank based on Score, aCPM, TargetCPM, and Error Rate.
 * @param {number} score The calculated score (0-100).
 * param {number} aCPM The adjusted Characters Per Minute.
 * param {number} targetCPM The target CPM.
 * @param {number} errorRate The calculated error rate percentage.
 * @returns {string} The rank ('S', 'A', 'B', 'C', 'D').
 */
export function determineRank(score, errorRate) {
    // if (targetCPM <= 0) return 'D'; // Default rank if targetCPM is invalid

    // const acpmRatio = aCPM / targetCPM; 

    // Check S rank first (most strict)
    // && acpmRatio >= 0.95
    if (score >= 95 && errorRate === 0) {
        return 'S';
    }
    // Check A rank
    // && acpmRatio >= 0.8 && acpmRatio < 0.95
    if (score >= 80 && score <= 94 && errorRate <= 1) {
        return 'A';
    }
    // Check B rank
    // && acpmRatio >= 0.6 && acpmRatio < 0.8 
    if (score >= 60 && score <= 79 && errorRate <= 3) {
        return 'B';
    }
    // Check C rank
    // && acpmRatio >= 0.4 && acpmRatio < 0.6
    if (score >= 40 && score <= 59 && errorRate <= 5) {
        return 'C';
    }
    // Default to D rank if none of the above conditions are met
    return 'D';
}

// Обновляем объект экспорта по умолчанию, чтобы включить новые функции
export default {
    convertToArabicNumber,
    createNoTashkeelString,
    removeTashkeel,
    applyIncorrectWordStyle,
    applyCorrectWordStyle,
    getOriginalTopOffset,
    handleHiddenWords,
    clearContainer,
    getTransitionDuration,
    fillContainer,
    toggleDarkMode,
    initDarkMode,
    formatTime,
    clamp,
    calculateCPM,
    calculateErrorRate,
    calculateAdjustedCPM,
    calculateScore,
    determineRank,
};