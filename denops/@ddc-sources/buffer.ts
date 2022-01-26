import {
  BaseSource,
  Candidate,
  DdcEvent,
} from "https://deno.land/x/ddc_vim@v1.2.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnEventArguments,
} from "https://deno.land/x/ddc_vim@v1.2.0/base/source.ts#^";
import * as fn from "https://deno.land/x/denops_std@v2.4.0/function/mod.ts#^";
import { Denops } from "https://deno.land/x/denops_std@v2.4.0/mod.ts#^";

export async function getFileSize(fname: string): Promise<number> {
  let file: Deno.FileInfo;
  try {
    file = await Deno.stat(fname);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return -1;
    }
    return -1;
  }
  return file.size;
}

export function allWords(lines: string[], pattern: string): string[] {
  const words = lines
    .flatMap((line) => [...line.matchAll(new RegExp(pattern, "gu"))])
    .map((match) => match[0])
    .filter((word) => word.length > 0);
  return Array.from(new Set(words)); // remove duplication
}

type Params = {
  requireSameFiletype: boolean;
  limitBytes: number;
  fromAltBuf: boolean;
  forceCollect: boolean;
  showBufName: boolean;
};

type bufCache = {
  bufnr: number;
  filetype: string;
  candidates: Candidate[];
  bufname: string;
};

export class Source extends BaseSource<Params> {
  private buffers: { [bufnr: string]: bufCache } = {};
  events = [
    "BufWinEnter",
    "BufWritePost",
    "InsertLeave",
    "BufEnter",
  ] as DdcEvent[];

  private async gatherWords(
    denops: Denops,
    bufnr: number,
    pattern: string,
  ): Promise<Candidate[]> {
    return allWords(await fn.getbufline(denops, bufnr, 1, "$"), pattern)
      .map((word) => ({ word }));
  }

  private async makeCurrentBufCache(
    denops: Denops,
    filetype: string,
    pattern: string,
    limit: number,
  ): Promise<void> {
    const endLine = await fn.line(denops, "$");
    const size = (await fn.line2byte(
      denops,
      endLine + 1,
    )) - 1;
    if (size > limit) {
      return;
    }
    const bufnr = await fn.bufnr(denops);

    this.buffers[bufnr.toString()] = {
      bufnr: bufnr,
      filetype: filetype,
      candidates: await this.gatherWords(denops, bufnr, pattern),
      bufname: await fn.bufname(denops, bufnr),
    };
  }

  private async makeFileBufCache(
    denops: Denops,
    bufnr: number,
    pattern: string,
    limit: number,
    force: boolean,
  ): Promise<void> {
    const bufname = await fn.bufname(denops, bufnr);
    if (!force) {
      const size = await getFileSize(bufname);
      if (size < 0 || size > limit) return;
    }

    this.buffers[bufnr.toString()] = {
      bufnr: bufnr,
      filetype: await fn.getbufvar(denops, bufnr, "&filetype") as string,
      candidates: await this.gatherWords(denops, bufnr, pattern),
      bufname: bufname,
    };
  }

  private async checkCache(
    denops: Denops,
    pattern: string,
    limit: number,
    force: boolean,
  ): Promise<void> {
    const tabBufnrs = (await fn.tabpagebuflist(denops) as number[]);

    for (const bufnr of tabBufnrs) {
      if (!(bufnr in this.buffers)) {
        await this.makeFileBufCache(denops, bufnr, pattern, limit, force);
      }
    }

    for (const bufnr of Object.keys(this.buffers)) {
      if (
        !(bufnr in tabBufnrs) &&
        !(await fn.buflisted(denops, Number(bufnr)))
      ) {
        delete this.buffers[bufnr];
      }
    }
  }

  async onEvent({
    denops,
    context,
    options,
    sourceParams,
  }: OnEventArguments<Params>): Promise<void> {
    if (
      context.event == "BufEnter" &&
      (await fn.bufnr(denops) in this.buffers)
    ) {
      return;
    }

    await this.makeCurrentBufCache(
      denops,
      context.filetype,
      options.keywordPattern,
      sourceParams.limitBytes as number,
    );

    await this.checkCache(
      denops,
      options.keywordPattern,
      sourceParams.limitBytes,
      false,
    );
  }

  async gatherCandidates({
    denops,
    context,
    sourceParams,
  }: GatherCandidatesArguments<Params>): Promise<Candidate[]> {
    const p = sourceParams as unknown as Params;
    const tabBufnrs = (await fn.tabpagebuflist(denops) as number[]);
    const altbuf = await fn.bufnr(denops, "#");

    return Object.values(this.buffers).filter((buffer) =>
      !p.requireSameFiletype ||
      (buffer.filetype == context.filetype) ||
      tabBufnrs.includes(buffer.bufnr) ||
      (p.fromAltBuf && (altbuf == buffer.bufnr))
    ).map((buf) => {
      if (p.showBufName) {
        return buf.candidates.map((b) => ({
          word: b.word,
          menu: buf.bufname,
        }));
      }
      return buf.candidates;
    }).flatMap((candidate) => candidate);
  }

  params(): Params {
    return {
      requireSameFiletype: true,
      limitBytes: 1e6,
      fromAltBuf: false,
      forceCollect: false,
      showBufName: false,
    };
  }
}
