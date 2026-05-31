// Security Script to protect the brand and logic
(function() {
    // 1. Disable Right Click
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // 2. Disable Keyboard Shortcuts
    document.onkeydown = function(e) {
        // Disable F12
        if (e.keyCode === 123) {
            return false;
        }
        // Disable Ctrl+Shift+I (Inspect)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
            return false;
        }
        // Disable Ctrl+Shift+J (Console)
        if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
            return false;
        }
        // Disable Ctrl+U (View Source)
        if (e.ctrlKey && e.keyCode === 85) {
            return false;
        }
        // Disable Ctrl+S (Save)
        if (e.ctrlKey && e.keyCode === 83) {
            return false;
        }
    };

    // 3. Simple Debugger Loop (Optional, can be annoying but effective)
    /*
    setInterval(function() {
        debugger;
    }, 100);
    */
    
    console.log("%cLÖGVÍST ÖRYGGI %c- Hönnuðaskjár óvirkur", "color: #0082ff; font-size: 20px; font-weight: bold;", "color: #7f8c8d; font-size: 14px;");
})();
