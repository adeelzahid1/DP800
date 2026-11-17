import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'study',
    loadComponent: () => import('./features/study/study-page').then((m) => m.StudyPage),
  },
  {
    path: 'study/:subtopicId',
    loadComponent: () => import('./features/study/study-page').then((m) => m.StudyPage),
  },
  {
    path: 'review',
    loadComponent: () => import('./features/review/review-page').then((m) => m.ReviewPage),
  },
  {
    path: 'notebook',
    loadComponent: () => import('./features/notebook/notebook-page').then((m) => m.NotebookPage),
  },
  {
    path: 'flashcards',
    loadComponent: () => import('./features/flashcards/flashcards-page').then((m) => m.FlashcardsPage),
  },
  {
    path: 'flashcards/:subtopicId',
    loadComponent: () => import('./features/flashcards/flashcards-page').then((m) => m.FlashcardsPage),
  },
  {
    path: 'mock',
    loadComponent: () => import('./features/mock/mock-setup').then((m) => m.MockSetup),
  },
  {
    path: 'mock/run',
    loadComponent: () => import('./features/mock/mock-run').then((m) => m.MockRun),
  },
  {
    path: 'mock/results/:attemptId',
    loadComponent: () => import('./features/mock/mock-results').then((m) => m.MockResults),
  },
  {
    path: 'search',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  { path: '**', redirectTo: '' },
];
