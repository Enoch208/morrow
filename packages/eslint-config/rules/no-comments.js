export const noComments = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      comment: "Comments are not allowed. Rename or extract until the code explains itself.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== "Shebang") {
            context.report({ loc: comment.loc, messageId: "comment" });
          }
        }
      },
    };
  },
};
