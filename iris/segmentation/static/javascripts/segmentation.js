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

function undo(){
    window.segmentationStore.getState().undo();
}

function redo(){
    window.segmentationStore.getState().redo();
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
    window.segmentationStore.getState().resetMask();
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
    const store = window.segmentationStore.getState();
    await store.loadMaskForImage(store.currentImageId);
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
    window.segmentationStore.getState().saveCurrentMask().then(() => {
        if (call_afterwards !== null) {
            call_afterwards();
        }
    }).catch(() => {});
}

function predict_mask(){
    const store = window.segmentationStore.getState();
    store.predictMask().catch((error) => {
        store.showErrorModal(error.message, 'AI Prediction Error');
    });
}



// REMOVED: window.init_segmentation - React now handles initialization directly

// Exposed for the React app until these are ported
window.init_views = init_views;
