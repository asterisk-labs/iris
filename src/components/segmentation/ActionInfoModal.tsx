/**
 * "Before you continue...": asks how difficult the mask was, for notes,
 * and whether it is complete, before moving to another image.
 */

import React, { useEffect, useState } from 'react';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { setActionInfo } from '../../services/actionInfo';
import { goToImage } from '../../segmentation/navigation';

const DIFFICULTY_LABELS = ['very easy', 'easy', 'okay', 'difficult', 'very difficult'];

const ActionInfoModal: React.FC = () => {
  const prompt = useSegmentationStore(s => s.actionInfoPrompt);
  const [difficulty, setDifficulty] = useState(3);
  const [notes, setNotes] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (prompt) {
      setDifficulty(prompt.action.difficulty);
      setNotes(prompt.action.notes ?? '');
      setComplete(!!prompt.action.complete);
    }
  }, [prompt]);

  if (!prompt) return null;

  const close = () => useSegmentationStore.getState().closeActionInfoPrompt();

  const saveAndContinue = () => {
    const store = useSegmentationStore.getState();
    store.setShowDialogueBeforeNextImage(false);
    setActionInfo(prompt.action.id, { complete, difficulty, notes }).catch(() => {});
    close();
    goToImage(prompt.targetImageId);
  };

  return (
    <div className="dialogue" style={{ display: 'block' }} data-testid="action-info-modal">
      <div className="dialogue-content">
        <div className="dialogue-header" style={{ backgroundColor: '#5cb85c' }}>
          <h2>Before you continue...</h2>
        </div>
        <div className="dialogue-body">
          <p>How difficult was it to create this mask?</p>
          <div className="slider">
            <div className="slider-value">{DIFFICULTY_LABELS[difficulty - 1]}</div>
            <input
              className="slider-widget"
              type="range"
              min={1}
              max={5}
              value={difficulty}
              aria-label="Difficulty"
              onChange={e => setDifficulty(parseInt(e.target.value, 10))}
            />
          </div>
          <p>Do you have any comments about this segmentation (max. 256 characters)?</p>
          <textarea
            style={{ width: '100%' }}
            maxLength={256}
            value={notes}
            aria-label="Notes"
            onChange={e => setNotes(e.target.value)}
          />
          <p>
            <label>
              <input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />
              {' '}I think this mask is complete and ready for evaluation.
            </label>
          </p>
          <p>
            <button onClick={saveAndContinue}>Save and continue</button>
            <button onClick={close}>Go back to the mask</button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ActionInfoModal;
