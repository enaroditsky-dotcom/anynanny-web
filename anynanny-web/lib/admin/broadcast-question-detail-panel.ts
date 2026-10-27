/** Whether an open question panel still needs its detail request. Closing never loads. */
export function shouldLoadQuestionDetail(open: boolean, loadedKey: string | null, requestKey: string): boolean {
  return open && loadedKey !== requestKey;
}
