import { useEffect, useState } from "react";

// True while the media query matches. For the places a CSS breakpoint can't
// reach, like a chart that needs an actual NUMBER for its label column width.
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches); // the query may have changed since the first render
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
