import {
  BaseSource,
  Candidate,
  DdcEvent,
} from "https://deno.land/x/ddc_vim@v0.5.2/types.ts#^";
import {
  GatherCandidatesArguments,
  OnEventArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.5.2/base/source.ts#^";
import * as fn from "https://deno.land/x/denops_std@v1.9.0/function/mod.ts#^";
import { Denops } from "https://deno.land/x/denops_std@v1.9.0/mod.ts#^";

export async function getFileSize(fname: string): Promise<number> {
  let file: Deno.FileInfo;
  try {
    file = await Deno.stat(fname);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return -1;
    }
    console.error(e);
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
};

type bufCache = {
  bufnr: number;
  filetype: string;
  candidates: Candidate[];
};

export class Source extends BaseSource {
  private buffers: { [bufnr: string]: bufCache } = {};
  events = [
    "BufReadPost",
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
    };
  }

  private async makeFileBufCache(
    denops: Denops,
    bufnr: number,
    limit: number,
  ): Promise<void> {
    const size = await getFileSize(await fn.bufname(denops, bufnr));
    if (size < 0 || size > limit) return;

    this.buffers[bufnr.toString()] = {
      bufnr: bufnr,
      filetype: await fn.getbufvar(denops, bufnr, "&filetype") as string,
      candidates: await this.gatherWords(denops, bufnr),
    };
  }

  private async checkCache(
    denops: Denops,
    tabBufnrs: number[],
    limit: number,
  ): Promise<void> {
    for (const bufnr of tabBufnrs) {
      if (!(bufnr in this.buffers)) {
        this.makeFileBufCache(denops, bufnr, limit);
      }
    }
  }

  async onInit({ denops, sourceParams }: OnInitArguments): Promise<void> {
    await this.checkCache(
      denops,
      await fn.tabpagebuflist(denops) as number[],
      sourceParams.limitBytes as number,
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
  }: OnEventArguments): Promise<void> {
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
  }: GatherCandidatesArguments): Promise<Candidate[]> {
    const p = sourceParams as unknown as Params;
    const tabBufnrs = (await denops.call("tabpagebuflist") as number[]);
    const altbuf = await fn.bufnr(denops, "#");

    await this.checkCache(denops, tabBufnrs, p.limitBytes);

    return Object.keys(this.buffers).map((bufnr) => this.buffers[bufnr]).filter(
      (buf) =>
        !p.requireSameFiletype ||
        (buf.filetype == context.filetype) ||
        tabBufnrs.includes(buf.bufnr) ||
        (p.fromAltBuf && (altbuf == buf.bufnr)),
    ).map((buf) => buf.candidates).flatMap((candidate) => candidate);
  }

  params(): Record<string, unknown> {
    const params: Params = {
      requireSameFiletype: true,
      limitBytes: 1e6,
      fromAltBuf: false,
    };
    return params as unknown as Record<string, unknown>;
  }
}
