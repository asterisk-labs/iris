"""Pixel models for the per-image AI, chosen with segmentation.ai_model.type.

Each model has fit(X, y) and predict(X), and describe() for the response.
"""
import lightgbm as lgb
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

TYPES = ('lightgbm', 'linear')


class LightGBMModel:
    """Gradient-boosted trees: the default, and what IRIS has always used."""

    def __init__(self, ai_model):
        self.ai_model = ai_model
        self.model = None

    def fit(self, X, y):
        # A share of the training pixels decides when to stop adding trees
        train_X, val_X, train_y, val_y = train_test_split(X, y, stratify=y, test_size=0.3, random_state=42)
        self.model = lgb.LGBMClassifier(
            num_leaves=self.ai_model['n_leaves'],
            max_bin=128,
            max_depth=self.ai_model['max_depth'],
            tree_learner='data',
            learning_rate=0.05,
            n_estimators=self.ai_model['n_estimators'],
            n_jobs=self.ai_model.get('n_jobs', 4),
            class_weight=self.ai_model.get('class_weight'),
            verbose=-1,
        )
        self.model.fit(train_X, train_y, eval_set=[(val_X, val_y)],
                       callbacks=[lgb.early_stopping(4, verbose=False)])
        return self

    def predict(self, X):
        return self.model.predict(X, num_iteration=self.model.best_iteration_)

    def describe(self):
        return {'type': 'lightgbm', 'trees': int(self.model.best_iteration_ or self.model.n_estimators)}


class LinearModel:
    """Logistic regression on standardised features. Meant for embedding
    bands, which are often close to linearly separable; on raw reflectance
    it is usually worse than LightGBM."""

    def __init__(self, ai_model):
        self.ai_model = ai_model
        self.model = None

    def fit(self, X, y):
        self.model = make_pipeline(
            StandardScaler(),
            LogisticRegression(C=self.ai_model.get('linear_c', 1.0),
                               class_weight=self.ai_model.get('class_weight'), max_iter=500),
        )
        self.model.fit(X, y)
        return self

    def predict(self, X):
        return self.model.predict(X)

    def describe(self):
        return {'type': 'linear', 'C': self.ai_model.get('linear_c', 1.0)}


def get_model(ai_model):
    kind = ai_model.get('type', 'lightgbm')
    if kind == 'linear':
        return LinearModel(ai_model)
    if kind == 'lightgbm':
        return LightGBMModel(ai_model)
    raise ValueError(f"Unknown ai_model.type '{kind}': use one of {', '.join(TYPES)}")
