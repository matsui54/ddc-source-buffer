# ddc-buffer
Buffer source for ddc.vim

This source collects keywords from current buffer, buffers whose window is in the same tabpage and buffers which has the same filetype.

## Required

### denops.vim
https://github.com/vim-denops/denops.vim

### ddc.vim
https://github.com/Shougo/ddc.vim

## Configuration
### params
- requireSameFiletype: If it is false, keywords from all listed buffers are collected.
If true, buffers which has the same filetype as the current buffer are used. (default true)

### example
```vim
call ddc#custom#patch_global('sources', ['buffer'])
call ddc#custom#patch_global('sourceOptions', {
    \ '_': {'matchers': ['matcher_head']},
    \ 'buffer': {'mark': 'B'},
    \ })

call ddc#custom#patch_global('filterParams', {
    \ 'buffer': {'requireSameFiletype': v:false},
    \ })
```
