/*Instead of 2D arrays we are going to use flattened 1D arrays for perfomance
reasons, i.e. array_2d[y][x] is going to be array_1d[y*row_length+x]*/


let commands = {
    "previous_image": {
        "key": "Backspace",
        "description": "Save this image and open previous one"
    },
    "next_image": {
        "key": "Return",
        "description": "Save this image and open next one"
    },
    "save_mask": {
        "key": "S",
        "description": "Save this mask"
    },
    "undo": {
        "key": "U",
        "description": "Undo last modification"
    },
    "redo": {
        "key": "R",
        "description": "Redo modification"
    },
    "select_class": {
        "key": "1 .. 9",
        "description": "Select class for drawing"
    },
    "tool_move": {
        "key": "W",
        "description": "Pan your current view by dragging and moving the cursor"
    },
    "tool_reset_views": {
        "key": "Z",
        "description": "Reset the view in the canvases"
    },
    "tool_draw": {
        "key": "D",
        "description": "Draw pixels on the mask"
    },
    "tool_eraser": {
        "key": "E",
        "description": "Erase previously drawn pixels"
    },
    "reset_mask": {
        "key": "N",
        "description": "Clear the whole mask"
    },
    "predict_mask": {
        "key": "A",
        "description": "Use the AI to help you filling out the mask"
    },
    "toggle_mask": {
        "key": "Space",
        "description": "Toggle mask on/off"
    },
    "mask_final": {
        "key": "F",
        "description": "Show the final mask combined from your pixels and the predictions by the AI"
    },
    "mask_user": {
        "key": "G",
        "description": "Show your drawn pixels only"
    },
    "mask_errors": {
        "key": "H",
        "description": "Show where the AI failed to predict correctly"
    },
    // "mask_highlight_edges": {
    //     "key": "B", "description": "Highlight edges on the masks",
    // },
    "toggle_contrast": {
        "key": "C", 
        "description": "Toggle contrast on/off"
    },
    "toggle_invert": {
        "key": "I", 
        "description": "Toggle inversion on/off"
    },
    "brightness_up": {
        "key": "Arrow-Up", 
        "description": "Increase brightness (+10%)"
    },
    "brightness_down": {
        "key": "Arrow-Down", 
        "description": "Decrease brightness (-10%)"
    },
    "saturation_up": {
        "key": "Arrow-Right",
        "description": "Increase saturation (+50%)"
    },
    "saturation_down": {
        "key": "Arrow-Left",
        "description": "Decrease saturation (-50%)"
    },
    "reset_filters": {
        "key": "X",
        "description": "Reset all image filters"
    },
    "show_view_controls": {
        "key": "V",
        "description":"Toggle display of view controls on/off"
    },
    "next_view_group": {
        "key": "B",
        "description": "Switch to next group view"
    }
};

function newuser_help_popup(){
    // Open the help menu if the user is new (no saved masks):
    // Get just logged in flag from React store (ONLY source)
    const justLoggedIn = window.getJustLoggedInFromStore ? 
        window.getJustLoggedInFromStore() : false;
    
    if (!window.getJustLoggedInFromStore) {
        console.error('[IRIS] ❌ Just logged in store not available');
    }
    
    // Use React store as primary source, fallback to legacy vars
    const isNewUser = window.isNewUserFromStore ? window.isNewUserFromStore() : false;
    
    if (isNewUser && justLoggedIn == true){
        dialogue_help();
        
        // Set just_logged_in to false using React store as primary
        if (window.setJustLoggedInInStore) {
            window.setJustLoggedInInStore(false);
        } // Store-based just logged in management
    }
}
async function init_views(){
    show_loader("Loading views...");
    
    // Load mask (now properly awaited):
    await load_mask();

    set_tool(window.getCurrentToolFromStore ? window.getCurrentToolFromStore() : 'draw');
    const currentClass = window.getCurrentClassFromStore ? window.getCurrentClassFromStore() : 0;
    set_current_class(currentClass);

    init_events();
    init_toolbar_events();

    reset_views();

    hide_loader(); // Ensure loader is hidden after initialization
    newuser_help_popup();
}

function init_events(){
    document.body.onkeydown = key_down;
    document.body.onkeyup = key_up;
    document.body.onresize = () => {
        // PRIMARY: Use React store (ONE-WAY SYNC)
        if (window.viewManagerStore) {
            window.viewManagerStore.getState().updateSize();
        } else {
            // React store is required - no fallback
            console.error('[IRIS Migration] ❌ CRITICAL: React store not available for updateSize');
            throw new Error('React store not available for ViewManager');
        }
    };

    window.addEventListener('unload', (event) => {
      // Only save if there are unsaved changes
      if (window.segmentationStore) {
          const state = window.segmentationStore.getState();
          if (state.maskChanged) {
              // Use sendBeacon for reliable delivery during page unload
              // fetch() is unreliable during unload as the browser may cancel it
              const maskData = window.getMaskDataFromStore ? window.getMaskDataFromStore() : null;
              const userMaskData = window.getUserMaskDataFromStore ? window.getUserMaskDataFromStore() : null;
              const maskShape = window.getMaskShapeFromStore ? window.getMaskShapeFromStore() : null;
              const segmentationUrl = window.getApiUrlFromStore ? window.getApiUrlFromStore('segmentation') : null;
              const currentImageId = window.getCurrentImageIdFromStore ? window.getCurrentImageIdFromStore() : null;
              
              if (maskData && userMaskData && maskShape && segmentationUrl && currentImageId) {
                  const m_length = maskShape[0] * maskShape[1];
                  const data = new Uint8Array(2 * m_length + 2);
                  data.set(new Uint8Array([254]));
                  data.set(maskData, 1);
                  data.set(userMaskData, m_length + 1);
                  data.set(new Uint8Array([254]), 2 * m_length + 1);
                  
                  const blob = new Blob([data], { type: 'application/octet-stream' });
                  navigator.sendBeacon(segmentationUrl + "save_mask/" + currentImageId, blob);
              }
          }
      }
    });
}

function init_toolbar_events(){
    let toolbuttons = document.getElementsByClassName("toolbutton");
    for (let toolbutton of toolbuttons) {
        if (toolbutton.id === null){
            continue;
        }
        let command_id = toolbutton.id.substr(3);
        if (command_id in commands){
            let text = commands[command_id].description;

            if ('key' in commands[command_id]){
                text = '<span class="key">'+commands[command_id].key+'</span> ' + text;
            }

            toolbutton.onmouseenter = show_message.bind(null, text, null);
            toolbutton.onmouseleave = hide_message.bind(null);
        }
    }
}

function key_down(event){
    let key = event.code;

    if (get_object('dialogue').style.display == "block"){
        // Don't allow any key events during an opened dialogue
    }else if (key == "Space"){
        // Use React store instead of vars
        if (window.segmentationStore) {
            window.segmentationStore.getState().toggleMask();
        } else {
            console.warn('Space key pressed but React store not available');
        }
    } else if (key == "KeyS"){
        save_mask();
    } else if (key == "Enter"){
        save_mask(next_image);
    } else if (key == "Backspace"){
        save_mask(prev_image);
    } else if (key == "KeyU"){
        undo();
    } else if (key == "KeyR"){
        redo();
    } else if (key == "KeyC"){
        // PRIMARY: Use React store for filter operations (ONE-WAY SYNC)
        if (window.viewManagerStore) {
            const currentFilters = window.viewManagerStore.getState().filters;
            window.viewManagerStore.getState().setFilters({ contrast: !currentFilters.contrast });
        } else {
            // React store is required - no fallback
            console.error('[IRIS Migration] ❌ CRITICAL: React store not available for contrast filter');
            throw new Error('React store not available for filter operations');
        }
    } else if (key == "KeyI"){
        // PRIMARY: Use React store for filter operations (ONE-WAY SYNC)
        if (window.viewManagerStore) {
            const currentFilters = window.viewManagerStore.getState().filters;
            window.viewManagerStore.getState().setFilters({ invert: !currentFilters.invert });
        } else {
            // React store is required - no fallback
            console.error('[IRIS Migration] ❌ CRITICAL: React store not available for invert filter');
            throw new Error('React store not available for filter operations');
        }
    } else if (key == "ArrowUp"){
        change_brightness(up=true);
    } else if (key == "ArrowDown"){
        change_brightness(up=false);
    } else if (key == "ArrowRight"){
        change_saturation(up=true);
    } else if (key == "ArrowLeft"){
        change_saturation(up=false);
    } else if (key == "KeyX"){
        reset_filters();
    } else if (key == "KeyY"){
        reset_views();
    } else if (key == "KeyA"){
        predict_mask();
    } else if (key == "KeyF"){
        set_mask_type("final");
    } else if (key == "KeyG"){
        set_mask_type("user");
    } else if (key == "KeyH"){
        set_mask_type("errors");
    } else if (key.startsWith("Digit") || key.startsWith("Numpad")){
        // Why do we subtract 1 from this? The class ids start with 0, so we
        // want to make the hotkey easier:
        var class_id = parseInt(key[key.length-1]) - 1;
        const classCount = window.getClassCountFromStore ? window.getClassCountFromStore() : 0;
        if (class_id < classCount){
            set_current_class(class_id);
        }
    } else if (key == "KeyD"){
        set_tool("draw");
    } else if (key == "KeyE"){
        set_tool("eraser");
    } else if (key == "KeyW"){
        set_tool("move");
    } else if (key == "KeyN"){
        dialogue_reset_mask();
    } else if (key == "KeyV"){
        if (window.viewManagerStore) {
            window.viewManagerStore.getState().toggleControls();
        }
    } else if (key == "KeyB"){
        if (window.viewManagerStore) {
            window.viewManagerStore.getState().showNextGroup();
        }
    } else if (event.shiftKey){
        // Update tool resizing mode through React store (primary source)
        if (window.segmentationStore) {
            window.segmentationStore.getState().setToolResizingMode(true);
        } // Store-based resizing mode management
    }
}

function key_up(event){
    // Update tool resizing mode through React store (primary source)
    if (window.segmentationStore) {
        window.segmentationStore.getState().setToolResizingMode(event.shiftKey);
    } // Store-based resizing mode management
}

function change_brightness(up){
    // Use React store if available (new source of truth)
    if (window.segmentationStore) {
        window.segmentationStore.getState().changeBrightness(up);
        return;
    }
    
    console.error('segmentationStore not available for change_brightness');
}
function change_saturation(up){
    if (window.segmentationStore) {
        window.segmentationStore.getState().changeSaturation(up);
        return;
    }
    console.error('segmentationStore not available for change_saturation');
}

function set_current_class(class_id){
    if (window.segmentationStore) {
        window.segmentationStore.getState().setCurrentClass(class_id);
        return; // Store handles everything including DOM updates
    }
    
    // Store-based class management
    const classColor = window.getClassColorFromStore ? window.getClassColorFromStore(class_id) : [255, 255, 255, 255];
    var css_colour = rgba2css(classColor);
    const className = window.getClassNameFromStore ? window.getClassNameFromStore(class_id) : `Class ${class_id}`;
    get_object("tb_current_class").innerHTML = className;
    get_object("tb_select_class").style["background-color"] = css_colour;

    // Convenience - automatically change to drawing tool after selecting class:
    set_tool("draw");
}

function set_tool(tool){
    // Update through React store (ONLY source)
    if (!window.setCurrentToolInStore) {
        console.error('[IRIS] ❌ Tool store not available');
        return;
    }
    
    window.setCurrentToolInStore(tool);
    // Store handles everything including DOM updates
}

function reset_views(){
    window.resetCanvasFromStore();
}

function update_drawn_pixels(){
    // Use React store (ONLY SOURCE)
    if (!window.updateUserPixelCountsInStore) {
        console.error('[IRIS Migration] ❌ CRITICAL: React store not available for pixel counting');
        throw new Error('React store required for pixel counting');
    }
    
    // Let React store calculate and update pixel counts
    const pixelCounts = window.updateUserPixelCountsInStore();
}

function discard_future(){
    // Use React store (ONLY SOURCE)
    if (!window.discardFutureInStore) {
        console.error('[IRIS Migration] ❌ CRITICAL: React store not available for discard future');
        throw new Error('React store required for history operations');
    }
    
    window.discardFutureInStore();
}

function update_history(){
    // Use React store (ONLY SOURCE)
    if (!window.updateHistoryInStore) {
        console.error('[IRIS Migration] ❌ CRITICAL: React store not available for history update');
        throw new Error('React store required for history operations');
    }
    
    window.updateHistoryInStore();
}

function undo(){
    console.log('[IRIS] 🔙 Undo called');
    
    // Use React store as ONLY source
    if (!window.undoInStore) {
        console.error('[IRIS] ❌ Store not available for undo');
        throw new Error('React store required for undo operation');
    }
    
    // Check if undo is possible
    if (window.canUndoFromStore && !window.canUndoFromStore()) {
        console.log('[IRIS] ⚠️ Cannot undo - no history available');
        return;
    }
    
    // Log current state before undo
    const maskDataBefore = window.getMaskDataFromStore ? window.getMaskDataFromStore() : null;
    const historyInfo = window.segmentationStore ? window.segmentationStore.getState() : null;
    console.log('[IRIS] 🔙 Before undo:', {
        historyLength: historyInfo?.maskHistory?.length,
        currentEpoch: historyInfo?.historyCurrentEpoch,
        maskDataLength: maskDataBefore?.length,
        firstFewPixels: maskDataBefore ? Array.from(maskDataBefore.slice(0, 20)) : null
    });
    
    console.log('[IRIS] 🔙 Calling undoInStore...');
    
    // Call store undo
    window.undoInStore();
    
    // Log state after undo
    const maskDataAfter = window.getMaskDataFromStore ? window.getMaskDataFromStore() : null;
    const historyInfoAfter = window.segmentationStore ? window.segmentationStore.getState() : null;
    console.log('[IRIS] 🔙 After undo:', {
        historyLength: historyInfoAfter?.maskHistory?.length,
        currentEpoch: historyInfoAfter?.historyCurrentEpoch,
        maskDataLength: maskDataAfter?.length,
        firstFewPixels: maskDataAfter ? Array.from(maskDataAfter.slice(0, 20)) : null,
        maskChanged: maskDataBefore && maskDataAfter ? (maskDataBefore[0] !== maskDataAfter[0]) : 'unknown'
    });
    
    console.log('[IRIS] 🔙 Store undo completed, scheduling render...');
    
    // CRITICAL: Use setTimeout to ensure store update completes before rendering
    // Zustand updates are synchronous, but we need to ensure the mask data is accessible
    setTimeout(() => {
        console.log('[IRIS] 🔙 Rendering after undo...');
        
        // Trigger legacy rendering functions with updated mask from store
        update_drawn_pixels();
        
        console.log('[IRIS] ✅ Undo render complete');
    }, 0);

    // Notify React store that mask has changed
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available for undo');
        return;
    }
    
    const store = window.segmentationStore.getState();
    store.setMaskChanged(true);
    store.setShowDialogueBeforeNextImage(true);
}

function redo(){
    console.log('[IRIS] 🔜 Redo called');
    
    // Use React store as ONLY source
    if (!window.redoInStore) {
        console.error('[IRIS] ❌ Store not available for redo');
        throw new Error('React store required for redo operation');
    }
    
    // Check if redo is possible
    if (window.canRedoFromStore && !window.canRedoFromStore()) {
        console.log('[IRIS] ⚠️ Cannot redo - no future history available');
        return;
    }
    
    console.log('[IRIS] 🔜 Calling redoInStore...');
    
    // Call store redo
    window.redoInStore();
    
    console.log('[IRIS] 🔜 Store redo completed, scheduling render...');
    
    // CRITICAL: Use setTimeout to ensure store update completes before rendering
    // Zustand updates are synchronous, but we need to ensure the mask data is accessible
    setTimeout(() => {
        console.log('[IRIS] 🔜 Rendering after redo...');
        
        // Trigger legacy rendering functions with updated mask from store
        update_drawn_pixels();
        
        console.log('[IRIS] ✅ Redo render complete');
    }, 0);

    // Notify React store that mask has changed
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available for redo');
        return;
    }
    
    const store = window.segmentationStore.getState();
    store.setMaskChanged(true);
    store.setShowDialogueBeforeNextImage(true);
}

// CRITICAL: Helper function for efficient mask pixel updates during drawing
function set_mask_type(type){
    // Use React store as ONLY source
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ CRITICAL: Store not available for set_mask_type');
        throw new Error('React store required for mask type operations');
    }
    
    window.segmentationStore.getState().setMaskType(type);
    // Store handles everything including DOM updates
}

function reset_mask(){
    // Use React store as ONLY source (no fallbacks)
    if (!window.getMaskShapeFromStore || !window.setMaskDataInStore || !window.setUserMaskDataInStore) {
        console.error('[IRIS] ❌ CRITICAL: Store not available for reset_mask');
        throw new Error('React store required for reset mask');
    }
    
    const maskShape = window.getMaskShapeFromStore();
    if (!maskShape) {
        console.error('[IRIS] ❌ No mask shape available from store for reset_mask');
        throw new Error('Mask shape not available');
    }
    
    // Create new empty mask arrays
    const newMaskData = new Uint8Array(maskShape[0] * maskShape[1]);
    const newUserMaskData = new Uint8Array(maskShape[0] * maskShape[1]);
    newMaskData.fill(0);
    newUserMaskData.fill(0);
    
    // Update React store with reset mask data (ONLY source)
    window.setMaskDataInStore(newMaskData, maskShape[0], maskShape[1]);
    window.setUserMaskDataInStore(newUserMaskData);
    
    console.log('[IRIS] ✅ Reset mask using React store');

    update_drawn_pixels();

    // Set flag to show confirmation dialog before navigating away
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available for reset_mask');
        return;
    }
    
    const store = window.segmentationStore.getState();
    store.setShowDialogueBeforeNextImage(true);
    // IMPORTANT: Mark mask as changed so it gets saved properly
    store.setMaskChanged(true);
}

function reset_filters(){
    // PRIMARY: Use React store (ONE-WAY SYNC)
    if (window.resetFiltersFromStore) {
        window.resetFiltersFromStore();
        return;
    }
    
    // React store is required - no fallback
    console.error('[IRIS Migration] ❌ CRITICAL: React store not available for reset filters');
    throw new Error('React store not available for filter operations');
}

function show_mask(visible){
    // MIGRATION COMPLETE: Use React store as source of truth
    // The store syncs to DOM via React effect in segmentation-app.tsx
    if (window.segmentationStore) {
        window.segmentationStore.getState().setShowMask(visible);
        return; // React handles everything
    }
    
    // FALLBACK: Should never reach here if React loaded properly
    console.warn('show_mask() called but React store not available yet');
}

// REMOVED: async function fetch_server_update - React now handles config loading directly
// This function has been replaced by useConfigLoader hook in React

async function load_mask(){
    // PHASE 2: Check React store first (new source of truth)
    if (window.segmentationStore) {
        const store = window.segmentationStore.getState();
        const currentImageId = window.getCurrentImageIdFromStore();
        if (!currentImageId) {
            console.error('[IRIS] ❌ No current image ID available for load_mask');
            return;
        }
        
        if (currentImageId) {
            try {
                await store.loadMaskForImage(currentImageId);
                return; // Store handles everything
            } catch (error) {
                console.error('[IRIS] Store load_mask failed:', error);
                // Fall back to legacy behavior on error
            }
        } else {
            console.error('[IRIS] No current image ID available for load_mask');
            return;
        }
    }
    
    console.log('[IRIS] Using load_mask fallback, store not available');
    await legacyLoadMask();
}

async function legacyLoadMask(){
    show_loader("Loading masks...");

    // Get segmentation URL from React store (ONLY source)
    if (!window.getApiUrlFromStore) {
        console.error('[IRIS] ❌ API URL store not available for legacyLoadMask');
        hide_loader();
        return;
    }
    
    const segmentationUrl = window.getApiUrlFromStore('segmentation');
    if (!segmentationUrl) {
        console.error('[IRIS] ❌ No segmentation URL available for legacyLoadMask');
        hide_loader();
        return;
    }

    const currentImageId = window.getCurrentImageIdFromStore();
    if (!currentImageId) {
        console.error('[IRIS] ❌ No current image ID available for legacyLoadMask');
        return;
    }

    const maskUrl = segmentationUrl + "load_mask/" + currentImageId;

    var results = await download(maskUrl, { cache: 'no-store' });

    if (results.response.status != 200 && results.response.status != 404) {
        hide_loader();

        let error = await results.response.text();
        show_dialogue(
            "error",
            "Could not load the mask from the server!\n" + error
        );
        return;
    }

    // Get mask shape from React store
    const maskShape = window.getMaskShapeFromStore();
    if (!maskShape) {
        console.error('[IRIS Migration] ❌ No mask shape available from store');
        hide_loader();
        show_dialogue("error", "Could not load mask: mask dimensions not available");
        return;
    }
    
    var mask_length = maskShape[1] * maskShape[0];
    
    // Initialize mask arrays
    var maskData = new Uint8Array(mask_length);
    var userMaskData = new Uint8Array(mask_length);
    var errorsMaskData = new Uint8Array(mask_length);
    errorsMaskData.fill(0);

    if (results.response.status == 200){
        var data = results.data;
        maskData = data.slice(1, mask_length+1);
        userMaskData = data.slice(mask_length+1, 2*mask_length+1);
    } else if (results.response.status == 404) {
        // Just use the default mask
        maskData.fill(0);
        userMaskData.fill(0);
    }

    // Update React store (ONLY source)
    if (!window.setMaskDataInStore || !window.setUserMaskDataInStore || !window.setErrorsMaskDataInStore) {
        console.error('[IRIS] ❌ CRITICAL: Store not available for mask loading');
        throw new Error('React store required for mask operations');
    }
    
    if (window.setMaskDataInStore && window.setUserMaskDataInStore && window.setErrorsMaskDataInStore) {
        try {
            window.setMaskDataInStore(maskData, maskShape[0], maskShape[1]);
            window.setUserMaskDataInStore(userMaskData);
            window.setErrorsMaskDataInStore(errorsMaskData);
        } catch (error) {
            console.error('[IRIS] ❌ React store mask loading failed:', error);
        }
    } else {
        console.warn('[IRIS] ⚠️ React store not available for mask loading');
    }

    // Get mask type from React store (ONLY source)
    if (!window.getMaskTypeFromStore) {
        console.error('[IRIS] ❌ CRITICAL: Store not available for mask type in reload_mask');
        throw new Error('React store required for mask type');
    }
    const maskType = window.getMaskTypeFromStore();
    set_mask_type(maskType);
    
    hide_loader();
    
    update_drawn_pixels();

    // Part of the history (undo-redo) system. When new pixels are drawn, we
    // delete all saved future elements in the history stack and add the
    // current masks to the history (IMMEDIATE for mask loading)
    discard_future();
    update_history();
}

async function download(url, init=null, html_object=null){
    if (init === null){
        var response = await fetch(url);
    } else {
        var response = await fetch(url, init);
    }

    if (response.status >= 400){
        if (response.status == 403) {
            dialogue_login();
        }
        return {
            "response": response,
            "data": null
        };
    }

    let header = response.headers.get("content-type");
    let data;
    if (header == "application/octet-stream"){
        const reader = response.body.getReader();
        let received_bytes = 0;
        let chunks = [];

        while (true) {
            const result = await reader.read();

            if (result.value) {
                received_bytes += result.value.length;
                chunks.push(result.value);
            }

            if (result.done) break;
        }

        data = new Uint8Array(received_bytes);
        let position = 0;
        for(let chunk of chunks) {
          data.set(chunk, position);
          position += chunk.length;
        }
    } else {
        data = await response.json();
    }

    return {
        "response": response,
        "data": data
    };
}

async function dialogue_before_next_image(){
    // Check store for dialogue flag
    const shouldShowDialogue = window.segmentationStore 
        ? window.segmentationStore.getState().showDialogueBeforeNextImage
        : false;
    
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available for dialogue_before_next_image');
    }
    
    if (!shouldShowDialogue){
        return;
    }

    show_loader("Making some checks...")
    
    // Use React store as primary source, fallback to legacy vars
    const mainUrl = window.getApiUrlFromStore ? window.getApiUrlFromStore('main') : '/';

    if (!mainUrl) {
        console.error('[IRIS Migration] ❌ No main URL available for dialogue_before_next_image');
        hide_loader();
        return;
    }

    const currentImageId = window.getCurrentImageIdFromStore();
    if (!currentImageId) {
        console.error('[IRIS] ❌ No current image ID available for dialogue_before_next_image');
        return;
    }

    let response = await fetch(`${mainUrl}get_action_info/${currentImageId}/segmentation`);
    if (response.status >= 400){
        // Continue without any dialogue
        hide_loader(); // Fix: Hide the loader before continuing
        if (!window.segmentationStore) {
            console.error('[IRIS] ❌ Segmentation store not available');
            return;
        }
        
        window.segmentationStore.getState().setShowDialogueBeforeNextImage(false);
        next_image();
        return;
    }
    var action = await response.json();
    var difficulty_labels=['very easy', 'easy', 'okay', 'difficult', 'very difficult'];

    var content = `
    <p>How difficult was it to create this mask?</p>
    <div class="slider">
        <div class="slider-value">${difficulty_labels[action.difficulty-1]}</div>
        <input
            class="slider-widget"
            id="dbni-difficulty"
            type="range" min="1" max="5"
            value="${action.difficulty}"
            oninput="let difficulty_labels=['very easy', 'easy', 'okay', 'difficult', 'very difficult']; this.previousElementSibling.innerHTML = difficulty_labels[parseInt(this.value)-1];">
    </div>
    <p>Do you have any comments about this segmentation (max. 256 characters)?</p>
    <textarea id="dbni-notes" style="width: 100%">${action.notes}</textarea>
    <p><input id="dbni-complete_action" type="checkbox" ${((action.complete) ? 'checked' : '')}> I think this mask is complete and ready for evaluation.</p>
    <p>
    <button onclick='dialogue_before_next_image_save_and_continue(${action.id});'>Save and continue</button>
    <button onclick='hide_dialogue();'>Go back to the mask</button>
    </p>
`;
    show_dialogue("info", content, true, "Before you continue...");
}

function dialogue_before_next_image_save_and_continue(action_id){
    // Clear the dialogue flag
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available');
        return;
    }
    
    window.segmentationStore.getState().setShowDialogueBeforeNextImage(false);

    action_info = {
        "complete": get_object('dbni-complete_action').checked,
        "difficulty": parseInt(get_object('dbni-difficulty').value),
        "notes": get_object('dbni-notes').value
    }

    // Get main URL from React store (ONLY source)
    if (!window.getApiUrlFromStore) {
        console.error('[IRIS] ❌ API URL store not available for action info');
        return;
    }
    
    const mainUrlForActionInfo = window.getApiUrlFromStore('main');
    if (!mainUrlForActionInfo) {
        console.error('[IRIS] ❌ No main URL available for action info');
        return;
    }

    console.log('action',action_info.complete)

    fetch(`${mainUrlForActionInfo}set_action_info/${action_id}`, {
        method: "POST",
        body: JSON.stringify(action_info)
    })

    // Check if there's a pending navigation from dropdown
    if (window.pendingNavigationImageId) {
        const imageId = window.pendingNavigationImageId;
        window.pendingNavigationImageId = null; // Clear it
        const url = `/segmentation/?image_id=${encodeURIComponent(imageId)}`;
        goto_url(url);
    } else {
        // Normal next image navigation
        next_image();
    }
}

function save_mask(call_afterwards=null){
    // PHASE 2: Check React store first (new source of truth)
    if (window.segmentationStore) {
        const store = window.segmentationStore.getState();
        store.saveCurrentMask().then(() => {
            if (call_afterwards !== null) {
                call_afterwards();
            }
        }).catch((error) => {
            console.error('[IRIS] Store save_mask failed:', error);
            // Fall back to legacy behavior on error
            legacySaveMask(call_afterwards);
        });
        return;
    }
    
    console.log('[IRIS] Using save_mask fallback, store not available');
    legacySaveMask(call_afterwards);
}

function legacySaveMask(call_afterwards=null){
    show_message('Saving mask...');
    
    // Get mask data from React store (ONLY SOURCE)
    if (!window.getMaskDataFromStore || !window.getUserMaskDataFromStore) {
        console.error('[IRIS] ❌ React store not available for saving');
        show_dialogue("error", "Cannot save mask: React store not available");
        if (call_afterwards !== null) {
            call_afterwards();
        }
        return Promise.reject(new Error('React store not available'));
    }
    
    const maskData = window.getMaskDataFromStore();
    const userMaskData = window.getUserMaskDataFromStore();
    
    // Do not save any masks if they have not been loaded yet
    if (maskData === null || userMaskData === null){
        console.error('[IRIS] ❌ Mask data is null, cannot save');
        if(call_afterwards !== null){
          call_afterwards();
        }
        return Promise.resolve();
    }

    // Combine both masks together to one byte array with padding magic
    // numbers 254 to make sure the transaction was done successfully
    const maskShape = window.getMaskShapeFromStore();
    if (!maskShape) {
        console.error('[IRIS] No mask shape available for save operation');
        if (call_afterwards !== null) {
            call_afterwards();
        }
        return Promise.reject(new Error('No mask shape'));
    }
    
    var m_length = maskShape[0] * maskShape[1];
    var data = new Uint8Array(2*m_length+2);
    var padding = new Uint8Array([254]);
    data.set(padding);
    data.set(maskData, 1);
    data.set(userMaskData, m_length+1);
    data.set(padding, 2*m_length+1);

    const segmentationUrl = window.getApiUrlFromStore ? window.getApiUrlFromStore('segmentation') : null;
    if (!segmentationUrl) {
        console.error('[IRIS] ❌ No segmentation URL available for legacySaveMask');
        if (call_afterwards !== null) {
            call_afterwards();
        }
        return Promise.reject(new Error('No segmentation URL'));
    }

    const currentImageId = window.getCurrentImageIdFromStore();
    if (!currentImageId) {
        console.error('[IRIS] ❌ No current image ID available for legacySaveMask');
        if (call_afterwards !== null) {
            call_afterwards();
        }
        return Promise.reject(new Error('No current image ID'));
    }

    return fetch(segmentationUrl + "save_mask/" + currentImageId, {
        method: "POST",
        body: data,
        headers: {
            "Content-Type": "application/octet-stream"
        }
    }).then(async (response) => {
        await save_mask_finished(response, call_afterwards);
        if (response.status !== 200) {
            throw new Error(`Save failed with status ${response.status}`);
        }
    });
}

async function save_mask_finished(response, call_afterwards){
    // Note: fetch_server_update() removed - React handles config updates directly
    // Mask saving doesn't require config reload, just success/error handling

    if (response.status === 200) {
        show_message('Mask saved', 1000);
        if(call_afterwards !== null){
          call_afterwards();
        }
    } else {
        let error = await response.text();
        show_dialogue(
            "error",
            "<p>Could not save the mask due to an internal problem!</p>" + error
        )
    }
}

async function predict_mask(){
    // PHASE 2: Check React store first (new source of truth)
    if (window.segmentationStore) {
        const store = window.segmentationStore.getState();
        try {
            await store.predictMask();
            return; // Store handles everything
        } catch (error) {
            console.error('[IRIS] Store predict_mask failed:', error);
            // Fall back to legacy behavior on error
        }
    }
    
    console.log('[IRIS] Using predict_mask fallback, store not available');
    await legacyPredictMask();
}

async function legacyPredictMask(){
    // PHASE 1: Use React store for AI training validation (primary source)
    let validationResult;
    if (window.validateAITrainingDataFromStore) {
        try {
            validationResult = window.validateAITrainingDataFromStore();
            
            if (!validationResult.isValid) {
                return; // React store handles error display
            }
        } catch (error) {
            console.error('[IRIS Migration] ❌ React store AI validation failed:', error);
        }
    } else {
        console.warn('[IRIS Migration] ⚠️ React store AI validation not available, using legacy fallback');
    }
    
    // Get pixel counts from React store (ONLY source)
    if (!window.getUserPixelCountsFromStore) {
        console.error('[IRIS] ❌ User pixel counts store not available');
        hide_loader();
        return;
    }
    
    const pixelCounts = window.getUserPixelCountsFromStore();
    if (!pixelCounts) {
        console.error('[IRIS] ❌ No pixel counts available');
        hide_loader();
        return;
    }
    
    // Get class count from React store (ONLY source)
    if (!window.getClassCountFromStore) {
        console.error('[IRIS] ❌ Class count store not available');
        throw new Error('React store required for class count');
    }
    const classCount = window.getClassCountFromStore();
    
    // Get user classes from validation result or calculate from pixel counts
    let user_classes;
    if (validationResult && validationResult.classPixelCounts) {
        user_classes = Object.keys(validationResult.classPixelCounts)
            .map(key => parseInt(key))
            .filter(classId => validationResult.classPixelCounts[classId] > 10);
    } else {
        user_classes = [];
        
        for (var i=0; i < classCount; i++){
            if (pixelCounts[i] > 10){
                user_classes.push(i);
            }
        }
        if (user_classes.length < 2){
            // This validation is now handled by React store, just return
            // The React store will show the modern error modal
            return;
        }
    }

    show_loader("Prepare training data...");

    // Get mask data from React store (ONLY source)
    if (!window.getMaskDataFromStore || !window.getUserMaskDataFromStore) {
        console.error('[IRIS] ❌ Mask data store not available for legacyPredictMask');
        hide_loader();
        return;
    }
    
    let maskData, userMaskData;
    try {
        maskData = window.getMaskDataFromStore();
        userMaskData = window.getUserMaskDataFromStore();
    } catch (error) {
        console.error('[IRIS] ❌ Failed to get mask data from store:', error);
        hide_loader();
        return;
    }

    if (!maskData || !userMaskData) {
        console.error('[IRIS] ❌ No mask data available for legacyPredictMask');
        hide_loader();
        return;
    }

    // Get all the user pixels
    let all_user_pixels = new Array();
    let all_user_labels = new Array();
    for (var i=0; i<=userMaskData.length; i++){
        // Only add the user pixel if there are enough pixels from that class:
        if (userMaskData[i] && pixelCounts[maskData[i]] > 10){
            all_user_pixels.push(i);
            all_user_labels.push(maskData[i]);
        }
    }

    // Sample training points (we do not want to train the model on all points):
    let all_indices = Array(all_user_pixels.length).fill().map((_, i) => i);
    var rng = new RNG(42);
    rng.shuffle(all_indices);

    // We need to keep track of how many pixels we already have sampled.
    // Furthermore, we keep also a ratio of pixels as testing dataset:
    let n_samples = {};
    let test_n_samples = {};
    
    // Get AI model config from React store (ONLY source)
    const aiModel = window.getConfigSectionFromStore ? 
        window.getConfigSectionFromStore('segmentation')?.ai_model : null;
    
    if (!window.getConfigSectionFromStore) {
        console.error('[IRIS] ❌ Config store not available for AI model');
    }

    if (!aiModel) {
        console.error('[IRIS] ❌ No AI model config available for legacyPredictMask');
        hide_loader();
        return;
    }

    for (let user_class of user_classes){
        // Set the current number of samples (0) and the maximum
        // Use pixel counts from React store (primary) or legacy vars (fallback)
        const classPixelCount = pixelCounts[user_class] || 0;
        
        n_samples[user_class] = {
            "current": 0,
            "max": Math.min(
                round_number(classPixelCount * aiModel.train_ratio),
                aiModel.max_train_pixels
            )
        };
        test_n_samples[user_class] = {
            "current": 0,
            "max": Infinity
        };
    }

    // Here we decide whether we send a pixel for training to the server or keep
    // it here as testing dataset:
    let test_indices = new Array();
    let train_user_pixels = new Array();
    let train_user_labels = new Array();
    let test_user_pixels = new Array();
    let test_user_labels = new Array();
    for (let i of all_indices){
        let class_id = all_user_labels[i];
        if (n_samples[class_id].current < n_samples[class_id].max){
            train_user_pixels.push(all_user_pixels[i]);
            train_user_labels.push(class_id);
            n_samples[class_id].current += 1;
        } else {
            test_indices.push(i);
            test_user_pixels.push(all_user_pixels[i]);
            test_user_labels.push(class_id);
            test_n_samples[class_id].current += 1;
        }
    }

    show_loader("Train AI...");
    
    // Get segmentation URL from React store (ONLY source)
    if (!window.getApiUrlFromStore) {
        console.error('[IRIS] ❌ API URL store not available for legacyPredictMask');
        hide_loader();
        return;
    }
    
    const segmentationUrl = window.getApiUrlFromStore('segmentation');
    if (!segmentationUrl) {
        console.error('[IRIS] ❌ No segmentation URL available for legacyPredictMask');
        hide_loader();
        return;
    }

    if (!segmentationUrl) {
        console.error('[IRIS Migration] ❌ No segmentation URL available for legacyPredictMask');
        hide_loader();
        return;
    }

    const currentImageId = window.getCurrentImageIdFromStore();
    if (!currentImageId) {
        console.error('[IRIS] ❌ No current image ID available for legacyPredictMask');
        return;
    }

    let results = await download(
            segmentationUrl + "predict_mask/" + currentImageId,
            {
                method: "POST",
                body: JSON.stringify({
                    "user_pixels": train_user_pixels,
                    "user_labels": train_user_labels
                })
            }
        );

    show_loader("Process results...");
    if (results.response.status >= 500) {
        hide_loader();
        console.log("Could not predict the mask! Code: " + results.response.status);
        show_dialogue(
            "error",
            "<p>Could not predict the mask due to a server problem!</p>"
        )
        return;
    }

    // Calculate confusion matrix and harmonic mean of accuracies:
    let cm = createArray(classCount, classCount);
    fill2DArray(cm, 0);

    // Create errors mask through React store (ONLY source)
    // Reuse maskData from earlier in the function
    const maskLength = maskData?.length;
    
    if (!maskLength) {
        console.error('[IRIS] ❌ No mask data available for errors mask');
        hide_loader();
        return;
    }
    
    const newErrorsMask = new Uint8Array(maskLength);
    newErrorsMask.fill(0);
    
    // Set errors mask through React store (ONLY source)
    if (!window.setErrorsMaskDataInStore) {
        console.error('[IRIS] ❌ Store not available for errors mask');
        hide_loader();
        return;
    }
    window.setErrorsMaskDataInStore(newErrorsMask);

    let tp = {};
    for (let user_class of user_classes){
        tp[user_class] = 0;
    }
    
    // Get current errors mask from React store for pixel updates
    let currentErrorsMask;
    if (window.getErrorsMaskDataFromStore) {
        currentErrorsMask = window.getErrorsMaskDataFromStore();
    } else {
        console.error('[IRIS] ❌ CRITICAL: Store not available for errors mask');
        throw new Error('React store required for errors mask');
    }
    
    if (!currentErrorsMask) {
        console.error('[IRIS Migration] legacyPredictMask: No errors mask available for pixel setting');
        return;
    }
    
    // Create a copy for modification
    const updatedErrorsMask = new Uint8Array(currentErrorsMask);
    
    for (let i of test_indices){
        let mask_index = all_user_pixels[i];
        cm[all_user_labels[i]][results.data[mask_index]] += 1;
        if (all_user_labels[i] == results.data[mask_index]){
            tp[all_user_labels[i]] += 1;

            // Correct:
            updatedErrorsMask[mask_index] = 1;
        } else {
            // Incorrect:
            updatedErrorsMask[mask_index] = 2;
        }
    }
    
    // Update through React store (primary source)
    if (window.setErrorsMaskDataInStore) {
        window.setErrorsMaskDataInStore(updatedErrorsMask);
    } else {
        console.error('[IRIS] ❌ CRITICAL: Store not available for errors mask update');
        throw new Error('React store required for errors mask');
    }
    let acc_prod = user_classes.length;
    let acc_sum = 0;
    for (let label of user_classes){
        let acc = tp[label] / test_n_samples[label].current;
        acc_prod *= acc;
        acc_sum += acc;
    }

    // CRITICAL: Set the confusion matrix through React store (primary source) with fallback to legacy vars
    if (window.createConfusionMatrixFromStore && window.setConfusionMatrixInStore) {
        // Get class names from React store (ONLY source)
        if (!window.getClassesFromStore) {
            console.error('[IRIS] ❌ Classes store not available for confusion matrix');
            return; // Cannot create confusion matrix without class names
        }
        
        const classNames = window.getClassesFromStore().map(cls => cls.name);
        
        // Create structured confusion matrix object
        const confusionMatrixObj = window.createConfusionMatrixFromStore(cm, tp, user_classes, classNames);
        
        // Set in React store (primary source)
        window.setConfusionMatrixInStore(confusionMatrixObj);
    } else {
        console.error('[IRIS] ❌ Confusion matrix store not available - cannot save confusion matrix');
    }

    update_ai_box(acc_prod / acc_sum, cm, tp, user_classes);

    // Apply prediction results using React store (ONLY SOURCE)
    if (!window.getMaskDataFromStore || !window.getUserMaskDataFromStore || !window.setMaskDataInStore) {
        console.error('[IRIS Migration] ❌ CRITICAL: React store not available for prediction application');
        hide_loader();
        throw new Error('React store required for AI prediction');
    }
    
    const currentMaskData = window.getMaskDataFromStore();
    const currentUserMaskData = window.getUserMaskDataFromStore();
    const maskShape = window.getMaskShapeFromStore();
    
    if (!currentMaskData || !currentUserMaskData || !maskShape) {
        console.error('[IRIS Migration] ❌ Mask data not available from store for prediction');
        hide_loader();
        throw new Error('Mask data not available');
    }
    
    const newMaskData = new Uint8Array(currentMaskData);

    // Only update the mask where the user did not draw to
    let aiPixelsApplied = 0;
    for (var i = 0; i < results.data.length; i++) {
        if (!currentUserMaskData[i]){
            newMaskData[i] = results.data[i];
            aiPixelsApplied++;
        }
    }

    console.log(`[IRIS] AI Prediction: Applied ${aiPixelsApplied} AI-predicted pixels`);

    // Update store with prediction results
    window.setMaskDataInStore(newMaskData, maskShape[0], maskShape[1]);
    
    // Part of the history (undo-redo) system. When new pixels are drawn, we
    // delete all saved future elements in the history stack and add the
    // current masks to the history (IMMEDIATE for AI predictions)
    discard_future();
    update_history();

    hide_loader();

    // Set dialogue flag in store
    if (!window.segmentationStore) {
        console.error('[IRIS] ❌ Segmentation store not available for AI prediction');
        return;
    }
    
    window.segmentationStore.getState().setShowDialogueBeforeNextImage(true);
}



function update_ai_box(score, cm, tp, user_classes){
    // CRITICAL: Don't update AI score DOM directly when React is available
    // React AIScore component handles this via the store
    if (!window.segmentationStore) {
        // Fallback: Update DOM directly only if React store not available
        console.warn('[IRIS Migration] ⚠️ FALLBACK: Updating AI score DOM directly - React store not available');
        get_object("ai-score").innerHTML = round_number(score*100) + "%";
    } else {
        console.log('[IRIS Migration] ✅ Skipping AI score DOM update - React AIScore component handles this');
    }

    let recommendation = "Draw more training pixels!";

    let min_acc = 1;
    let worst_label = null;

    // CRITICAL: Get accuracy stats from React store (primary source) with fallback to legacy calculation
    let accuracyStats = null;
    if (window.getAccuracyStatsFromStore) {
        accuracyStats = window.getAccuracyStatsFromStore();
        if (accuracyStats) {
            min_acc = accuracyStats.worstAccuracy;
            worst_label = accuracyStats.worstClass;
            console.log('[IRIS Migration] ✅ Using accuracy stats from React store');
        }
    }
    
    // Fallback to legacy calculation if React store not available
    if (!accuracyStats) {
        console.warn('[IRIS Migration] ⚠️ FALLBACK: getAccuracyStatsFromStore not available, using legacy calculation');
        
        // Get pixel counts from React store (ONLY source)
        if (!window.getUserPixelCountsFromStore) {
            console.error('[IRIS] ❌ User pixel counts store not available for accuracy calculation');
            // Continue without accuracy stats
        } else {
            const pixelCounts = window.getUserPixelCountsFromStore();
            if (!pixelCounts) {
                console.error('[IRIS] ❌ No pixel counts available for accuracy calculation');
                // Continue without accuracy stats
            } else {
                // Calculate accuracy for each class
                for (let label of user_classes){
                    let acc = tp[label] / (pixelCounts[label]);
                    if (acc < min_acc){
                        min_acc = acc;
                        worst_label = label;
                    }
                }
            }
        }
    }
    if (worst_label !== null){
        // Get class name from React store (ONLY source)
        if (!window.getClassNameFromStore) {
            console.error('[IRIS] ❌ Class name store not available');
            recommendation = "Could you provide more training pixels for <b>Class " + worst_label + "</b>";
        } else {
            const className = window.getClassNameFromStore(worst_label);
            if (!className) {
                console.error('[IRIS] ❌ Class name not found for label:', worst_label);
                recommendation = "Could you provide more training pixels for <b>Class " + worst_label + "</b>";
            } else {
                recommendation = "Could you provide more training pixels for <b>"+className+"</b>";
            }
        }
    }

    get_object("ai-recommendation").innerHTML = recommendation;
}

// REMOVED: window.init_segmentation - React now handles initialization directly

// Exposed for the React app until these are ported
window.legacySaveMask = legacySaveMask;
window.load_mask = load_mask;
window.legacyLoadMask = legacyLoadMask;
window.init_views = init_views;
