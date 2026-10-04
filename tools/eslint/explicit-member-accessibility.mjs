// TypeScript members are public by default. Making that explicit is safe;
// choosing private or protected requires a deliberate design decision.
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require explicit class member accessibility except on constructors and auto-fix missing modifiers to public.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingAccessibility: 'Add an explicit access modifier. Formatting defaults to public.',
    },
  },
  create(context) {
    function checkMember(node) {
      // Constructors may omit a modifier; native #private members cannot have one.
      // Constructor parameter properties are checked separately.
      if (node.kind === 'constructor' || node.accessibility || node.key?.type === 'PrivateIdentifier') {
        return;
      }

      const lastDecorator = node.decorators?.at(-1);
      const firstToken = lastDecorator ? context.sourceCode.getTokenAfter(lastDecorator) : context.sourceCode.getFirstToken(node);

      context.report({
        loc: firstToken.loc,
        messageId: 'missingAccessibility',
        fix: (fixer) => fixer.insertTextBefore(firstToken, 'public '),
      });
    }

    return {
      'MethodDefinition, TSAbstractMethodDefinition': checkMember,
      'PropertyDefinition, TSAbstractPropertyDefinition, AccessorProperty, TSAbstractAccessorProperty': checkMember,
      TSParameterProperty: checkMember,
    };
  },
};
