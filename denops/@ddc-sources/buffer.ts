import {
  BaseSource,
  Candidate,
  DdcEvent,
} from "https://deno.land/x/ddc_vim@v0.18.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnEventArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.18.0/base/source.ts#^";
import * as fn from "https://deno.land/x/denops_std@v1.11.3/function/mod.ts#^";
import { Denops } from "https://deno.land/x/denops_std@v1.11.3/mod.ts#^";

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

export function allWords(lines: string[]): string[] {
  const words = lines
    .flatMap((line) => [...line.matchAll(/[_\p{L}\d]+/gu)])
    .map((match) => match[0]);
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
  ): Promise<Candidate[]> {
    return allWords(await fn.getbufline(denops, bufnr, 1, "$"))
      .map((word) => ({ word }));
  }

  private async makeCurrentBufCache(
    denops: Denops,
    filetype: string,
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
      candidates: await this.gatherWords(denops, bufnr),
      bufname: await fn.bufname(denops, bufnr),
    };
  }

  private async makeFileBufCache(
    denops: Denops,
    bufnr: number,
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
      candidates: await this.gatherWords(denops, bufnr),
      bufname: bufname,
    };
  }

  private async checkCache(
    denops: Denops,
    tabBufnrs: number[],
    limit: number,
    force: boolean,
  ): Promise<void> {
    for (const bufnr of tabBufnrs) {
      if (!(bufnr in this.buffers)) {
        await this.makeFileBufCache(denops, bufnr, limit, force);
      }
    }
  }

  async onInit(
    { denops, sourceParams }: OnInitArguments<Params>,
  ): Promise<void> {
    await this.checkCache(
      denops,
      await fn.tabpagebuflist(denops) as number[],
      sourceParams.limitBytes as number,
      sourceParams.forceCollect as boolean,
    );
    await this.makeCurrentBufCache(
      denops,
      await fn.getbufvar(denops, "%", "&filetype") as string,
      sourceParams.limitBytes as number,
    );
  }

  async onEvent({
    denops,
    context,
    sourceParams,
  }: OnEventArguments<Params>): Promise<void> {
    if (
      context.event == "BufEnter" && (await fn.bufnr(denops) in this.buffers)
    ) {
      return;
    }
    await this.makeCurrentBufCache(
      denops,
      context.filetype,
      sourceParams.limitBytes as number,
    );

    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    for (const bufnr of Object.keys(this.buffers)) {
      if (
        !(bufnr in tabBufnrs) && !(await fn.buflisted(denops, Number(bufnr)))
      ) {
        delete this.buffers[bufnr];
      }
    }
  }

  async gatherCandidates({
    denops,
    context,
    sourceParams,
  }: GatherCandidatesArguments<Params>): Promise<Candidate[]> {
    const p = sourceParams as unknown as Params;
    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    const altbuf = await fn.bufnr(denops, "#");

    await this.checkCache(denops, tabBufnrs, p.limitBytes, false);

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
