let selectedRating = null;

const optionBtns = document.querySelectorAll('.option-btn');
const fillBtn = document.getElementById('fillBtn');
const statusEl = document.getElementById('status');

// Handle option selection
optionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Deselect all
    optionBtns.forEach(b => b.classList.remove('selected'));
    // Select clicked
    btn.classList.add('selected');
    selectedRating = btn.dataset.value;
    fillBtn.disabled = false;
    // Hide status if shown
    statusEl.className = 'status';
  });
});

// Fill the form
fillBtn.addEventListener('click', async () => {
  if (!selectedRating) return;

  fillBtn.disabled = true;
  fillBtn.textContent = 'Filling...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillFeedbackForm,
      args: [selectedRating]
    });

    const result = results[0].result;

    if (result.success) {
      showStatus('success', `✅ Filled ${result.count} question(s) with "${selectedRating}"`);
    } else {
      showStatus('error', result.message || '❌ Could not find any radio buttons on this page.');
    }
  } catch (err) {
    showStatus('error', '❌ Cannot access this page. Try reloading.');
  }

  fillBtn.disabled = false;
  fillBtn.textContent = 'Fill All Questions';
});

function showStatus(type, message) {
  statusEl.className = 'status ' + type;
  statusEl.textContent = message;
}

// ---- Content script injected into page ----
function fillFeedbackForm(rating) {
  try {
    // Map rating text to possible label variations on the page
    const ratingMap = {
      'Excellent': ['excellent'],
      'Very Good': ['very good', 'verygood'],
      'Good': ['good'],
      'Fair': ['fair'],
      'Poor': ['poor']
    };

    const targets = ratingMap[rating] || [rating.toLowerCase()];

    let filled = 0;

    // Strategy 1: Find all radio inputs and check their associated labels
    const allRadios = document.querySelectorAll('input[type="radio"]');

    allRadios.forEach(radio => {
      // Get the label text for this radio
      let labelText = '';

      // Check <label for="id">
      if (radio.id) {
        const lbl = document.querySelector(`label[for="${radio.id}"]`);
        if (lbl) labelText = lbl.textContent.trim().toLowerCase();
      }

      // Check parent label
      if (!labelText) {
        const parentLabel = radio.closest('label');
        if (parentLabel) labelText = parentLabel.textContent.trim().toLowerCase();
      }

      // Check sibling text nodes
      if (!labelText) {
        const parent = radio.parentElement;
        if (parent) labelText = parent.textContent.trim().toLowerCase();
      }

      // Check next sibling text
      if (!labelText) {
        const next = radio.nextSibling;
        if (next && next.nodeType === 3) {
          labelText = next.textContent.trim().toLowerCase();
        }
      }

      // Check value attribute
      const radioValue = (radio.value || '').toLowerCase();
      const radioName  = (radio.name  || '').toLowerCase();

      const isMatch = targets.some(t =>
        labelText.includes(t) ||
        radioValue.includes(t) ||
        radioValue === t
      );

      if (isMatch) {
        radio.checked = true;
        // Dispatch events so the page's JS picks up the change
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input',  { bubbles: true }));
        radio.click();
        filled++;
      }
    });

    // Strategy 2: If radio approach didn't work, look for label elements
    if (filled === 0) {
      const allLabels = document.querySelectorAll('label');
      allLabels.forEach(label => {
        const text = label.textContent.trim().toLowerCase();
        const isMatch = targets.some(t => text === t || text.includes(t));
        if (isMatch) {
          // Find associated input
          let input = null;
          if (label.htmlFor) {
            input = document.getElementById(label.htmlFor);
          } else {
            input = label.querySelector('input[type="radio"]');
          }
          if (input) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.click();
            filled++;
          } else {
            // Click the label itself (some frameworks handle this)
            label.click();
            filled++;
          }
        }
      });
    }

    // Strategy 3: Look for span/div elements that act as custom radio options
    if (filled === 0) {
      const clickable = document.querySelectorAll('span, div, li, td');
      clickable.forEach(el => {
        const text = el.textContent.trim().toLowerCase();
        const isMatch = targets.some(t => text === t);
        if (isMatch && el.children.length === 0) {
          el.click();
          filled++;
        }
      });
    }

    if (filled === 0) {
      return { success: false, message: '❌ No matching options found. Make sure you are on the feedback page.' };
    }

    return { success: true, count: filled };
  } catch (e) {
    return { success: false, message: '❌ Error: ' + e.message };
  }
}
