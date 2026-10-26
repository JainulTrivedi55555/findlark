'use client';
// Loads one candidate (GET /api/people/{id}). When the recruiter came from a
// search, also reads that search's page 1 (a cheap read) for the skills it asked
// for, which the page highlights. That second request is optional: if it fails
// the page simply shows no highlights.
import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api-client';
import type { Person } from '@/lib/api-types';

export type PersonState =
  | { status: 'loading' }
  | { status: 'ready'; person: Person; matchSkills: Set<string> }
  | { status: 'notfound' }
  | { status: 'error'; error: unknown };

export function usePerson(personId: string, searchId: string | null) {
  const [state, setState] = useState<PersonState>({ status: 'loading' });
  // Bumped by Retry to load again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true; // false once the id changed or the page closed: ignore a late answer
    Promise.all([
      api.person(personId),
      searchId ? api.searchPage(searchId, 1).catch(() => null) : Promise.resolve(null),
    ])
      .then(([person, search]) => {
        if (!active) return;
        const matchSkills = new Set(search ? [...search.filters.skills, ...search.filters.skills_any] : []);
        setState({ status: 'ready', person, matchSkills });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && err.status === 404) setState({ status: 'notfound' });
        else setState({ status: 'error', error: err });
      });
    return () => {
      active = false;
    };
  }, [personId, searchId, attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return { state, retry };
}
